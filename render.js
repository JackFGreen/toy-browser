const images = require('images')

function render(viewport, el) {
  if (el.style) {
    console.log(el.style)

    const img = images(el.style.width, el.style.height)

    if (el.style['background-color']) {
      const color = el.style['background-color'] || 'rgb(0,0,0)'
      color.match(/rgb\((\d+),(\d+),(\d+)\)/)

      console.log(+RegExp.$1, +RegExp.$2, +RegExp.$3)

      img.fill(+RegExp.$1, +RegExp.$2, +RegExp.$3)

      viewport.draw(img, el.style.left || 0, el.style.top || 0)
    }
  }

  if (el.children) {
    for (const child of el.children) {
      render(viewport, child)
    }
  }
}

module.exports = render
