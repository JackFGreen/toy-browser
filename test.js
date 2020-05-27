const obj = {
  a: 'a',
  'Content-Type': 'asdf',
}

const CONTENT_TYPE = 'Content-Type'

const { a: aliasA } = obj
console.log(aliasA)

const { CONTENT_TYPE: contentType } = obj
console.log(contentType)

const { 'Content-Type': contentType2 } = obj
console.log(contentType2)

const str = 'asdf'
console.log('charAt', str[5], str.charAt(5))

class A {
  constructor() {
    this.n = 0
  }
  get result() {
    return this.n
  }
  plus() {
    this.n++
  }
}
const a = new A()
a.plus()
console.log(a.result)