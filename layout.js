module.exports.layout = function layout(node) {
  if (!node.computedStyle) return

  const style = getStyle(node.computedStyle)
  node.style = style

  if (style.display !== 'flex') return

  // const style = elmentStyle

  // width|height -> auto|'' -> null
  const size = ['width', 'height']
  size.forEach((p) => {
    if (style[p] === 'auto' || style[p] === '') style[p] = null
  })

  /**
   * !flexDirection | auto -> row
   * !alignItems | auto -> stretch
   * !justifyContent | auto -> flex-start
   * !flexWrap | auto -> nowrap
   * !alignContent | auto -> stretch
   */
  if (!style.flexDirection || style.flexDirection === 'auto') style.flexDirection = 'row'
  if (!style.alignItems || style.alignItems === 'auto') style.alignItems = 'stretch'
  if (!style.justifyContent || style.justifyContent === 'auto') style.justifyContent = 'flex-start'
  if (!style.flexWrap || style.flexWrap === 'auto') style.flexWrap = 'nowrap'
  if (!style.alignContent || style.alignContent === 'auto') style.alignContent = 'stretch'

  /**
   * mainSize, mainStart, mainEnd, mainSign, mainOrigin
   * crossSize, crossStart, crossEnd, crossSign, crossOrigin
   */
  let mainSize, mainStart, mainEnd, mainSign, mainOrigin
  let crossSize, crossStart, crossEnd, crossSign, crossOrigin

  const { flexDirection, alignItems, justifyContent, flexWrap, alignContent } = style

  if (flexDirection === 'row') {
    mainSize = 'width'
    mainStart = 'left'
    mainEnd = 'right'
    mainSign = +1
    mainOrigin = 0

    crossSize = 'height'
    crossStart = 'top'
    crossEnd = 'bottom'
  }

  if (flexDirection === 'row-reverse') {
    mainSize = 'width'
    mainStart = 'right'
    mainEnd = 'left'
    mainSize = -1
    mainOrigin = style.width

    crossSize = 'height'
    crossStart = 'top'
    crossEnd = 'bottom'
  }

  if (flexDirection === 'column') {
    mainSize = 'height'
    mainStart = 'top'
    mainEnd = 'bottom'
    mainSign = +1
    mainOrigin = 0

    crossSize = 'width'
    crossStart = 'left'
    crossEnd = 'right'
  }

  if (flexDirection === 'column-reverse') {
    mainSize = 'height'
    mainStart = 'bottom'
    mainEnd = 'top'
    mainSign = -1
    mainOrigin = style.height

    crossSize = 'width'
    crossStart = 'left'
    crossEnd = 'right'
  }

  if (flexWrap === 'wrap-reverse') {
    const tmp = crossStart
    crossStart = crossEnd
    crossEnd = tmp
    crossSign = -1
  } else {
    crossSign = 1
    crossOrigin = 0
  }

  /**
   * 总size = 子size 累加
   */

  const childItems = node.children.filter((o) => o.nodeType === 1)

  let isAutoMainSize = false

  if (!style[mainSize]) {
    style[mainSize] = 0

    childItems.forEach((c) => {
      const cSize = c.style[mainSize]
      if (cSize) style[mainSize] += cSize
    })

    isAutoMainSize = true
  }

  // 每一行
  let flexLine = []
  // 所有行
  const flexLines = [flexLine]

  let mainSpace = style[mainSize]
  let crossSpace = 0

  // style.flex -> push
  for (let i = 0; i < childItems.length; i++) {
    const item = childItems[i]
    const itemStyle = getStyle(item)

    if (!itemStyle[mainSize]) itemStyle[mainSize] = 0

    if (itemStyle.flex) {
      flexLine.push(item)
    } else if (style.flexWrap === 'nowrap' && isAutoMainSize) {
      mainSpace -= itemStyle[mainSize]

      if (itemStyle[crossSize]) crossSpace = Math.max(crossSpace, itemStyle[crossSize])

      flexLine.push(item)
    } else {
      if (itemStyle[mainSize] > style[mainSize]) {
        itemStyle[mainSize] = style[mainSize]
      }

      if (itemStyle[mainSize] > mainSpace) {
        flexLine.mainSpace = mainSpace
        flexLine.crossSpace = crossSpace
        // 换行
        flexLine = [item]
        flexLines.push(flexLine)
        // 重置
        mainSpace = style[mainSize]
        crossSpace = 0
      } else {
        flexLine.push(item)
      }

      if (!itemStyle[crossSize]) {
        crossSpace = Math.max(crossSpace, itemStyle[crossSize])
      }

      mainSpace -= itemStyle[mainSize]
    }

    flexLine.mainSpace = mainSpace

    if (style.flexWrap === 'nowrap' || isAutoMainSize) {
      flexLine.crossSpace = style[crossSize] ? style[crossSize] : crossSpace
    } else {
      flexLine.crossSpace = crossSpace
    }

    if (mainSpace < 0) {
      const scale = style[mainSize] / (style[mainSize] - mainSpace)
      let currentMain = mainOrigin
      for (let i = 0; i < childItems.length; i++) {
        const item = childItems[i]
        const itemStyle = getStyle(item)

        if (itemStyle.flex) itemStyle[mainSize] = 0

        itemStyle[mainSize] = itemStyle[mainSize] * scale

        itemStyle[mainStart] = currentMain
        itemStyle[mainEnd] = itemStyle[mainStart] + mainSign * itemStyle[mainSize]
        currentMain = itemStyle[mainEnd]
      }
    } else {
      flexLines.forEach((flexLine) => {
        const mainSpace = flexLine.mainSpace
        let flexTotal = 0

        for (let i = 0; i < childItems.length; i++) {
          const item = childItems[i]
          const itemStyle = getStyle(item)

          if (item.flex) flexTotal += item.flex
        }

        // 有 flex 属性的元素
        if (flexTotal > 0) {
          let currentMain = mainOrigin

          for (let i = 0; i < childItems.length; i++) {
            const item = childItems[i]
            const itemStyle = getStyle(item)

            if (item.flex) item[mainSize] = (mainSpace / flexTotal) * item.flex

            itemStyle[mainStart] = currentMain
            itemStyle[mainEnd] = itemStyle[mainStart] + mainSign * itemStyle[mainSize]
            currentMain = itemStyle[mainEnd]
          }
        } else {
          let currentMain
          let gutter
          // 没有 flex 属性元素
          if (style.justifyContent === 'flex-start') {
            currentMain = mainOrigin
            gutter = 0
          }
          if (style.justifyContent === 'flex-end') {
            currentMain = mainSpace * mainSign + mainOrigin
            gutter = 0
          }
          if (style.justifyContent === 'center') {
            currentMain = (mainSpace / 2) * mainSign + mainOrigin
            gutter = 0
          }
          if (style.justifyContent === 'space-between') {
            currentMain = mainOrigin
            gutter = (mainSpace / (childItems.length - 1)) * mainSign
          }
          if (style.justifyContent === 'space-around') {
            gutter = (mainSpace / childItems.length) * mainSign
            currentMain = gutter / 2 + mainOrigin
          }

          for (let i = 0; i < childItems.length; i++) {
            const item = childItems[i]
            const itemStyle = getStyle(item)

            itemStyle[mainStart] = currentMain
            itemStyle[mainEnd] = itemStyle[mainStart] + mainSign * itemStyle[mainSize]
            currentMain = itemStyle[mainEnd] + gutter
          }
        }
      })
    }

    // cross axis
    // align-items, align-self
    // let crossSpace
    // if (!style[crossSize]) {
    //   crossSpace = 0
    //   style[crossSize] = 0
    //   for (let i = 0; i < flexLines.length; i++) {
    //     const flexLine = flexLines[i]
    //     style[crossSize] += flexLine.crossSpace
    //   }
    // } else {
    //   crossSpace = style[crossSize]
    //   for (let i = 0; i < flexLines.length; i++) {
    //     const flexLine = flexLines[i]
    //     crossSpace -= flexLine.crossSpace
    //   }
    // }

    // if (style.flexWrap === 'wrap-reverse') {
    //   crossOrigin = style[crossSize]
    // } else {
    //   crossOrigin = 0
    // }

    // let lineSize = style[crossSize] / flexLines.length

    // flexLines.forEach((flexLine) => {
    //   let lineCrossSize =
    //     style.alignContent === 'stretch'
    //       ? flexLine.crossSpace + crossSpace / flexLines.length
    //       : flexLine.crossSpace
    // })
  }
}

/**
 * getStyle
 * computedStyle -> style -> px | strNumber -> number 转成数字运算
 */
function getStyle(computedStyle) {
  const style = {}

  for (const prop in computedStyle) {
    if (computedStyle.hasOwnProperty(prop)) {
      let val = computedStyle[prop].value

      if (val && (val.toString().match(/px$/) || val.toString().match(/^[0-9\.]+$/)))
        val = parseInt(val)

      style[prop] = val
    }
  }
  return style
}
