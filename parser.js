const css = require('css')
const { layout } = require('./layout')

// EOF: End Of File
// 模拟文件，标识结束，不知道是最后一个字符，一般字符随着文件一起结束
const EOF = Symbol('EOF')

function isEOF(c) {
  return c === EOF
}

const START_TAG = 'START_TAG'
const END_TAG = 'END_TAG'

class TagToken {
  constructor(options = {}) {
    const { type = '', tagName = '', selfClosing = false, attributes = [] } = options
    this.type = type
    this.tagName = tagName
    this.selfClosing = selfClosing
    this.attributes = attributes
  }
}

class AttrToken {
  constructor(options = {}) {
    const { name = '', value = '' } = options
    this.name = name
    this.value = value
  }
}

let curTagToken
let curAttrToken

const ELEMENT_NODE = 1
const TEXT_NODE = 3
const DOCUMENT_NODE = 9

class Element {
  constructor(options) {
    const { nodeType, tagName, attributes = [], children = [], data = '' } = options

    this.nodeType = nodeType

    if (this.nodeType === 3) {
      this.data = data
    } else {
      this.tagName = tagName
      this.attributes = attributes
      this.children = children
    }
  }
}

const document = new Element({
  nodeType: DOCUMENT_NODE,
  tagName: 'document',
})

let textNode

const stack = [document]

let CSSRules = []

function parseCSS(s) {
  const obj = css.parse(s)
  CSSRules.push(...obj.stylesheet.rules)
}

function computeCSS(el) {
  const { tagName } = el
  const nodes = [el]
  let p = el
  while (p.parent && p.parent.tagName !== 'document') {
    p = p.parent
    nodes.push(p)
  }

  for (const rule of CSSRules) {
    const { selectors, declarations } = rule

    for (const s of selectors) {
      const sels = s.split(' ').reverse()

      // [id, class, tag]
      const specificityArr = [0, 0, 0]

      const isMatch = matchNodesAndSels(nodes, sels, specificityArr)

      if (!isMatch) continue

      const specificity = specificityArr[0] * 100 + specificityArr[1] * 10 + specificityArr[2]

      for (const declar of declarations) {
        const { property, value } = declar
        if (!el.computedStyle) el.computedStyle = {}

        // 新属性 || 老属性的权重比当前的小
        if (
          !el.computedStyle[property] ||
          (el.computedStyle[property] && el.computedStyle[property].specificity < specificity)
        ) {
          if (!el.computedStyle[property]) el.computedStyle[property] = {}

          el.computedStyle[property].selector = s
          el.computedStyle[property].specificity = specificity
          el.computedStyle[property].value = value
        }
      }
    }
  }
}

/**
 * sels.length <= nodes.length
 * sels: child parent body
 * nodes: [child ... parent ...]? body html
 */
function matchNodesAndSels(nodes, sels, specificityArr) {
  const selsLen = sels.length
  let i = 0

  const nodesLen = nodes.length
  let j = 0

  let isMatch = match(nodes[j++], sels[i++], specificityArr)
  if (!isMatch || selsLen > nodesLen) return isMatch

  while (i < selsLen) {
    isMatch = false

    let sel = sels[i]
    const node = nodes[j]

    while (!isMatch) {
      if (j >= nodesLen) break
      isMatch = match(node, sel, specificityArr)
      if (!isMatch) j++
    }

    if (isMatch) {
      j++
      i++
    } else {
      break
    }
  }

  return isMatch
}

function match(node, sel, specificityArr) {
  let isMatch = false

  if (sel.charAt(0) === '#') {
    sel = sel.slice(1)
    const attr = node.attributes.find((e) => e.name === 'id')

    isMatch = attr && attr.value === sel
    if (isMatch) specificityArr[0] += 1
  } else if (sel.charAt(0) === '.') {
    sel = sel.slice(1)
    const attr = node.attributes.find((e) => e.name === 'class')

    isMatch = attr && attr.value === sel
    if (isMatch) specificityArr[1] += 1
  } else {
    isMatch = sel === node.tagName
    if (isMatch) specificityArr[2] += 1
  }

  return isMatch
}

function emit(c) {
  const top = stack[stack.length - 1]

  if (isEOF(c)) return

  if (c instanceof TagToken) {
    textNode = new Element({
      nodeType: TEXT_NODE,
    })

    const { tagName, attributes, type, selfClosing } = c

    if (type === START_TAG) {
      const el = new Element({
        nodeType: ELEMENT_NODE,
        tagName,
        attributes,
      })

      if (!selfClosing) stack.push(el)
      top.children.push(el)
      el.parent = top

      // after set parent
      if (CSSRules.length) computeCSS(el)
    }

    if (type === END_TAG) {
      if (tagName === top.tagName) {
        if (tagName === 'style') {
          const styleCont = top.children[0].data
          parseCSS(styleCont)
        }
        layout(top)
        stack.pop()
      } else {
        throw new Error('startTag and endTag not match')
      }
    }

    return
  }

  if (!textNode) {
    textNode = new Element({
      nodeType: TEXT_NODE,
    })
  }

  textNode.data += c

  if (!top.children.includes(textNode)) {
    top.children.push(textNode)
    textNode.parent = top
  }
}

/**
 * --- STATE RULE ---
 * switch state -> return state
 * reconsume state -> return state(current input)
 *
 * --- PARSE ERROR ---
 *
 * missing-end-tag-name
 * https://html.spec.whatwg.org/multipage/parsing.html#parse-error-missing-end-tag-name
 * This error occurs if the parser encounters a U+003E (>) code point where an end tag name is expected, i.e., </=>. The parser completely ignores whole "</>" code point sequence.
 *
 * eof-before-tag-name
 * https://html.spec.whatwg.org/multipage/parsing.html#parse-error-eof-before-tag-name
 * This error occurs if the parser encounters the end of the input stream where a tag name is expected. In this case the parser treats the beginning of a start tag (i.e., <) or an end tag (i.e., </) as text content.
 *
 * invalid-first-character-of-tag-name
 * https://html.spec.whatwg.org/multipage/parsing.html#parse-error-invalid-first-character-of-tag-name
 *
 * eof-in-tag
 * https://html.spec.whatwg.org/multipage/parsing.html#parse-error-eof-in-tag
 * This error occurs if the parser encounters the end of the input stream in a start tag or an end tag (e.g., <div id=). Such a tag is completely ignored.
 *
 * unexpected-solidus-in-tag
 * https://html.spec.whatwg.org/multipage/parsing.html#parse-error-unexpected-solidus-in-tag
 * This error occurs if the parser encounters a U+002F (/) code point that is not a part of a quoted attribute value and not immediately followed by a U+003E (>) code point in a tag (e.g., <div / id="foo">). In this case the parser behaves as if it encountered ASCII whitespace.
 *
 * unexpected-equals-sign-before-attribute-name
 * https://html.spec.whatwg.org/multipage/parsing.html#parse-error-unexpected-equals-sign-before-attribute-name
 *
 * unexpected-character-in-attribute-name
 * https://html.spec.whatwg.org/multipage/parsing.html#parse-error-unexpected-character-in-attribute-name
 *
 * missing-attribute-value
 * https://html.spec.whatwg.org/multipage/parsing.html#parse-error-missing-attribute-value
 * This error occurs if the parser encounters a U+003E (>) code point where an attribute value is expected (e.g., <div id=>). The parser treats the attribute as having an empty value.
 *
 * unexpected-character-in-unquoted-attribute-value
 * https://html.spec.whatwg.org/multipage/parsing.html#parse-error-unexpected-character-in-unquoted-attribute-value
 *
 * missing-whitespace-between-attributes
 * https://html.spec.whatwg.org/multipage/parsing.html#parse-error-missing-whitespace-between-attributes
 * This error occurs if the parser encounters attributes that are not separated by ASCII whitespace (e.g., <div id="foo"class="bar">). In this case the parser behaves as if ASCII whitespace is present.
 */

// https://html.spec.whatwg.org/multipage/parsing.html#data-state
function data(c) {
  /**
   * EOF
   * Emit an end-of-file token.
   */
  if (isEOF(c)) {
    emit(EOF)
    return data
  }

  /**
   * U+003C LESS-THAN SIGN (<)
   * Switch to the tag open state.
   */
  if (c === '<') return tagOpen

  /**
   * Anything else
   * Emit the current input character as a character token.
   */
  emit(c)
  return data
}

// https://html.spec.whatwg.org/multipage/parsing.html#tag-open-state
function tagOpen(c) {
  /**
   * EOF
   * This is an eof-before-tag-name parse error. Emit a U+003C LESS-THAN SIGN character token and an end-of-file token.
   */
  if (isEOF(c)) {
    emit('<')
    emit(EOF)
    return tagOpen
  }

  /**
   * U+002F SOLIDUS (/)
   * Switch to the end tag open state.
   */
  if (c === '/') return endTagOpen

  /**
   * ASCII alpha [a-zA-Z] https://infra.spec.whatwg.org/#ascii-alpha
   * Create a new start tag token, set its tag name to the empty string. Reconsume in the tag name state.
   */
  if (/[a-zA-Z]/.test(c)) {
    curTagToken = new TagToken({
      type: START_TAG,
    })
    return tagName(c)
  }

  /**
   * Anything else
   * This is an invalid-first-character-of-tag-name parse error. Emit a U+003C LESS-THAN SIGN character token. Reconsume in the data state.
   */
  emit('<')
  return data('<')
}

// https://html.spec.whatwg.org/multipage/parsing.html#end-tag-open-state
function endTagOpen(c) {
  /**
   * EOF
   * This is an eof-before-tag-name parse error. Emit a U+003C LESS-THAN SIGN character token, a U+002F SOLIDUS character token and an end-of-file token.
   */
  if (isEOF(c)) {
    emit('<')
    emit('/')
    emit(EOF)
    return endTagOpen
  }

  /**
   * ASCII alpha
   * Create a new end tag token, set its tag name to the empty string. Reconsume in the tag name state.
   */
  if (/[a-zA-Z]/.test(c)) {
    curTagToken = new TagToken({
      type: END_TAG,
    })
    return tagName(c)
  }

  /**
   * U+003E GREATER-THAN SIGN (>)
   * This is a missing-end-tag-name parse error. Switch to the data state.
   */
  if (c === '>') return data

  /**
   * Anything else
   * This is an invalid-first-character-of-tag-name parse error. Create a comment token whose data is the empty string. Reconsume in the bogus comment state.
   */
  throw new Error('invalid-first-character-of-tag-name')
}

// https://html.spec.whatwg.org/multipage/parsing.html#tag-name-state
function tagName(c) {
  /**
   * EOF
   * This is an eof-in-tag parse error. Emit an end-of-file token.
   */
  if (isEOF(c)) {
    emit(EOF)
    return tagName
  }

  /**
   * U+0009 CHARACTER TABULATION (tab) -> \t
   * U+000A LINE FEED (LF) -> \n
   * U+000C FORM FEED (FF) -> \f
   */
  if (/[\u0009\u000A\u000C]/.test(c)) return tagName

  /**
   * U+0020 SPACE
   * Switch to the before attribute name state.
   */
  if (c === '\u0020') return beforeAttrName

  /**
   * U+002F SOLIDUS (/)
   * Switch to the self-closing start tag state.
   */
  if (c === '/') return selfClosingStartTag

  /**
   * U+003E GREATER-THAN SIGN (>)
   * Switch to the data state. Emit the current tag token.
   */
  if (c === '>') {
    emit(curTagToken)
    return data
  }

  /**
   * ASCII upper alpha
   * Append the lowercase version of the current input character (add 0x0020 to the character's code point) to the current tag token's tag name.
   */
  if (/[A-Z]/.test(c)) {
    curTagToken.tagName += c.toLowerCase()
    return
  }

  /**
   * Anything else
   * Append the current input character to the current tag token's tag name.
   */
  curTagToken.tagName += c
  return tagName
}

// https://html.spec.whatwg.org/multipage/parsing.html#before-attribute-name-state
function beforeAttrName(c) {
  /**
   * U+002F SOLIDUS (/)
   * U+003E GREATER-THAN SIGN (>)
   * EOF
   * Reconsume in the after attribute name state.
   */
  if (isEOF(c) || /[\u002F\u003E]/.test(c)) return afterAttrName(c)

  /**
   * U+0009 CHARACTER TABULATION (tab)
   * U+000A LINE FEED (LF)
   * U+000C FORM FEED (FF)
   * U+0020 SPACE
   * Ignore the character.
   */
  if (/[\u0009\u000A\u000C\u0020]/.test(c)) return beforeAttrName

  /**
   * U+003D EQUALS SIGN (=)
   * This is an unexpected-equals-sign-before-attribute-name parse error. Start a new attribute in the current tag token. Set that attribute's name to the current input character, and its value to the empty string. Switch to the attribute name state.
   */
  if (c === '=') {
    curAttrToken = new AttrToken({
      name: c,
    })
    curTagToken.attributes.push(curAttrToken)
    return attrName
  }

  /**
   * Anything else
   * Start a new attribute in the current tag token. Set that attribute name and value to the empty string. Reconsume in the attribute name state.
   */
  curAttrToken = new AttrToken()
  curTagToken.attributes.push(curAttrToken)
  return attrName(c)
}

// https://html.spec.whatwg.org/multipage/parsing.html#attribute-name-state
function attrName(c) {
  /**
   * EOF
   * Reconsume in the after attribute name state.
   */
  if (isEOF(c)) return afterAttrName(c)

  /**
   * U+0009 CHARACTER TABULATION (tab)
   * U+000A LINE FEED (LF)
   * U+000C FORM FEED (FF)
   * U+0020 SPACE
   * U+002F SOLIDUS (/)
   * U+003E GREATER-THAN SIGN (>)
   */
  if (/[\u0009\u000A\u000C\u0020\u002F\u003E]/.test(c)) return attrName

  /**
   * U+003D EQUALS SIGN (=)
   * Switch to the before attribute value state.
   */
  if (c === '=') return beforeAttrValue

  /**
   * ASCII upper alpha
   * Append the lowercase version of the current input character (add 0x0020 to the character's code point) to the current attribute's name.
   */
  if (/[A-Z]/.test(c)) {
    curAttrToken.name += c.toLowerCase()
    return
  }

  /**
   * U+0022 QUOTATION MARK (")
   * U+0027 APOSTROPHE (')
   */
  if (/[\u0022\u0027]/.test(c)) return attrName

  /**
   * U+003C LESS-THAN SIGN (<)
   * This is an unexpected-character-in-attribute-name parse error. Treat it as per the "anything else" entry below.
   */

  /**
   * Anything else
   * Append the current input character to the current attribute's name.
   */
  curAttrToken.name += c
  return attrName
}

// https://html.spec.whatwg.org/multipage/parsing.html#after-attribute-name-state
function afterAttrName(c) {
  /**
   * EOF
   * This is an eof-in-tag parse error. Emit an end-of-file token.
   */
  if (isEOF(c)) {
    emit(EOF)
    return afterAttrName
  }

  /**
   * U+0009 CHARACTER TABULATION (tab)
   * U+000A LINE FEED (LF)
   * U+000C FORM FEED (FF)
   * U+0020 SPACE
   * Ignore the character.
   */
  if (/[\u0009\u000A\u000C\u0020]/.test(c)) return afterAttrName

  /**
   * U+002F SOLIDUS (/)
   * Switch to the self-closing start tag state.
   */
  if (c === '/') return selfClosingStartTag

  /**
   * U+003D EQUALS SIGN (=)
   * Switch to the before attribute value state.
   */
  if (c === '=') return beforeAttrValue

  /**
   * 003E GREATER-THAN SIGN (>)
   * Switch to the data state. Emit the current tag token.
   */
  if (c === '>') {
    emit(curTagToken)
    return data
  }

  /**
   * Anything else
   * Start a new attribute in the current tag token. Set that attribute name and value to the empty string. Reconsume in the attribute name state.
   */
  curAttrToken = new AttrToken()
  curTagToken.attributes.push(curAttrToken)
  return attrName(c)
}

// https://html.spec.whatwg.org/multipage/parsing.html#before-attribute-value-state
function beforeAttrValue(c) {
  /**
   * U+0009 CHARACTER TABULATION (tab)
   * U+000A LINE FEED (LF)
   * U+000C FORM FEED (FF)
   * U+0020 SPACE
   * Ignore the character.
   */
  if (/[\u0009\u000A\u000C\u0020]/.test(c)) return beforeAttrValue

  /**
   * U+0022 QUOTATION MARK (")
   * Switch to the attribute value (double-quoted) state.
   */
  if (c === '\u0022') return doubleQuotedAttrValue

  /**
   * U+0027 APOSTROPHE (')
   * Switch to the attribute value (single-quoted) state.
   */
  if (c === '\u0027') return singleQuotedAttrValue

  /**
   * U+003E GREATER-THAN SIGN (>)
   * This is a missing-attribute-value parse error. Switch to the data state. Emit the current tag token.
   */
  if (c === '\u003E') {
    emit(curTagToken)
    return data
  }

  /**
   * Anything else
   * Reconsume in the attribute value (unquoted) state.
   */
  return unQuotedAttrValue(c)
}

// https://html.spec.whatwg.org/multipage/parsing.html#attribute-value-(double-quoted)-state
function doubleQuotedAttrValue(c) {
  /**
   * EOF
   * This is an eof-in-tag parse error. Emit an end-of-file token.
   */
  if (isEOF(c)) {
    emit(EOF)
    return doubleQuotedAttrValue
  }

  /**
   * U+0022 QUOTATION MARK (")
   * Switch to the after attribute value (quoted) state.
   */
  if (c === '\u0022') return afterQuotedAttrValue

  /**
   * Anything else
   * Append the current input character to the current attribute's value.
   */
  curAttrToken.value += c
  return doubleQuotedAttrValue
}

// https://html.spec.whatwg.org/multipage/parsing.html#attribute-value-(single-quoted)-state
function singleQuotedAttrValue(c) {
  /**
   * EOF
   * This is an eof-in-tag parse error. Emit an end-of-file token.
   */
  if (isEOF(c)) {
    emit(EOF)
    return singleQuotedAttrValue
  }

  /**
   * U+0027 APOSTROPHE (')
   * Switch to the after attribute value (quoted) state.
   */
  if (c === '\u0027') return afterQuotedAttrValue

  /**
   * Anything else
   * Append the current input character to the current attribute's value.
   */
  curAttrToken.value += c
  return singleQuotedAttrValue
}

// https://html.spec.whatwg.org/multipage/parsing.html#attribute-value-(unquoted)-state
function unQuotedAttrValue(c) {
  /**
   * EOF
   * This is an eof-in-tag parse error. Emit an end-of-file token.
   */
  if (isEOF(c)) {
    emit(EOF)
    return unQuotedAttrValue
  }

  /**
   * U+0009 CHARACTER TABULATION (tab)
   * U+000A LINE FEED (LF)
   * U+000C FORM FEED (FF)
   */
  if (/[\u0009\u000A\u000C]/.test(c)) return unQuotedAttrValue

  /**
   * U+0020 SPACE
   * Switch to the before attribute name state.
   */
  if (c === '\u0020') return beforeAttrName

  /**
   * U+003E GREATER-THAN SIGN (>)
   * Switch to the data state. Emit the current tag token.
   */
  if (c === '>') {
    emit(curTagToken)
    return data
  }

  /**
   * U+0022 QUOTATION MARK (")
   * U+0027 APOSTROPHE (')
   * U+003C LESS-THAN SIGN (<)
   * U+003D EQUALS SIGN (=)
   */
  if (/[\u0022\u0027\u003C\u003D]/.test(c)) return unQuotedAttrValue

  /**
   * U+0060 GRAVE ACCENT (`)
   * This is an unexpected-character-in-unquoted-attribute-value parse error. Treat it as per the "anything else" entry below.
   */

  /**
   * Anything else
   * Append the current input character to the current attribute's value.
   */
  curAttrToken.value += c
  return unQuotedAttrValue
}

// https://html.spec.whatwg.org/multipage/parsing.html#after-attribute-value-(quoted)-state
function afterQuotedAttrValue(c) {
  /**
   * EOF
   * This is an eof-in-tag parse error. Emit an end-of-file token.
   */
  if (isEOF(c)) {
    emit(EOF)
    return afterQuotedAttrValue
  }

  /**
   * U+0009 CHARACTER TABULATION (tab)
   * U+000A LINE FEED (LF)
   * U+000C FORM FEED (FF)
   */
  if (/[\u0009\u000A\u000C]/.test(c)) return afterQuotedAttrValue

  /**
   * U+0020 SPACE
   * Switch to the before attribute name state.
   */
  if (c === '\u0020') return beforeAttrName

  /**
   * U+002F SOLIDUS (/)
   * Switch to the self-closing start tag state.
   */
  if (c === '/') return selfClosingStartTag

  /**
   * U+003E GREATER-THAN SIGN (>)
   * Switch to the data state. Emit the current tag token.
   */
  if (c === '>') {
    emit(curTagToken)
    return data
  }

  /**
   * Anything else
   * This is a missing-whitespace-between-attributes parse error. Reconsume in the before attribute name state.
   */
  return beforeAttrName(c)
}

// https://html.spec.whatwg.org/multipage/parsing.html#self-closing-start-tag-state
function selfClosingStartTag(c) {
  /**
   * EOF
   * This is an eof-in-tag parse error. Emit an end-of-file token.
   */
  if (isEOF(c)) {
    emit(EOF)
    return selfClosingStartTag
  }

  /**
   * U+003E GREATER-THAN SIGN (>)
   * Set the self-closing flag of the current tag token. Switch to the data state. Emit the current tag token.
   */
  if (c === '>') {
    curTagToken.selfClosing = true
    emit(curTagToken)
    return data
  }

  /**
   * Anything else
   * This is an unexpected-solidus-in-tag parse error. Reconsume in the before attribute name state.
   */
  return beforeAttrName(c)
}

module.exports.parseHTML = function parseHTML(html) {
  let state = data
  for (const c of html) {
    state = state(c)
  }
  state = state(EOF)

  return document
}
