const net = require('net')
const parser = require('./parser')

const CONTENT_TYPE = 'Content-Type'
const X_WWW_FORM_URLENCODED = 'application/x-www-form-urlencoded'
const APPLICATION_JSON = 'application/json'

const CONTENT_LENGTH = 'Content-Length'

class Request {
  // method
  // url: host port path
  // headers
  // body
  constructor(options = {}) {
    const {
      protocol = 'http',
      method = 'GET',
      host,
      port = 80,
      path = '/',
      headers = {},
      body = {},
    } = options

    this.protocol = protocol
    this.method = method
    this.host = host
    this.port = port
    this.path = path
    this.headers = headers
    this.body = body

    if (!this.headers[CONTENT_TYPE]) this.headers[CONTENT_TYPE] = X_WWW_FORM_URLENCODED

    const { 'Content-Type': contentType } = this.headers

    if (contentType === APPLICATION_JSON) this.bodyText = JSON.stringify(this.body)

    if (contentType === X_WWW_FORM_URLENCODED)
      this.bodyText = Object.keys(this.body)
        .map((k) => `${k}=${encodeURIComponent(this.body[k])}`)
        .join('&')

    this.headers[CONTENT_LENGTH] = this.bodyText.length
  }

  stringify() {
    return `${this.method} ${this.protocol}://${this.host}:${this.port}${this.path} HTTP/1.1
${Object.keys(this.headers)
  .map((k) => `${k}: ${encodeURIComponent(this.headers[k])}`)
  .join('\r\n')}

${this.bodyText}`
  }

  send(connection) {
    return new Promise((resolve, reject) => {
      if (connection) {
        connection.write(this.stringify())
      } else {
        connection = net.createConnection(
          {
            host: this.host,
            port: this.port,
          },
          () => {
            connection.write(this.stringify())
          }
        )
      }

      const parser = new ResponseParser()

      // 流式数据 不确定发几次过来
      // 不能直接 response
      // 需要用 parser 接收全部数据后返回给 response
      connection.on('data', (data) => {
        const str = data.toString()

        parser.receive(str)
        if (parser.isFinished) {
          resolve(parser.response)
        }

        connection.end()
      })

      connection.on('end', () => {
        reject('disconnected from server')
      })
    })
  }
}

class ResponseParser {
  constructor() {
    this.WAITING_STATUS_LINE = 0
    this.WAITING_STATUS_LINE_END = 1
    this.WAITING_HEADER_NAME = 2
    this.WAITING_HEADER_SPACE = 3
    this.WAITING_HEADER_VALUE = 4
    this.WAITING_HEADER_BLOCK_END = 5
    this.WAITING_BODY = 6

    this.current = this.WAITING_STATUS_LINE
    this.statusLine = ''
    this.headers = {}
    this.headerName = ''
    this.headerValue = ''
    this.bodyParser = null
  }

  get isFinished() {
    return this.bodyParser && this.bodyParser.isFinished
  }

  get response() {
    this.statusLine.match(/HTTP\/1\.1 ([0-9]+) ([\s\S]+)/)
    return {
      statusCode: RegExp.$1,
      statusText: RegExp.$2,
      headers: this.headers,
      body: this.bodyParser.content.join(''),
    }
  }

  receive(str) {
    for (let i = 0; i < str.length; i++) {
      const char = str[i]
      this.receiveChar(char)
    }
  }
  receiveChar(char) {
    if (this.current === this.WAITING_STATUS_LINE) {
      if (char === '\r') {
        this.current = this.WAITING_STATUS_LINE_END
      } else {
        this.statusLine += char
      }
      return
    }

    if (this.current === this.WAITING_STATUS_LINE_END) {
      if (char === '\n') {
        this.current = this.WAITING_HEADER_NAME
      }
      return
    }

    if (this.current === this.WAITING_HEADER_NAME) {
      if (char === ':') {
        this.current = this.WAITING_HEADER_SPACE
      } else if (char === '\r') {
        // 没有 header 直接是换行
        this.current = this.WAITING_HEADER_BLOCK_END
      } else {
        this.headerName += char
      }
      return
    }

    if (this.current === this.WAITING_HEADER_SPACE) {
      if (char === ' ') this.current = this.WAITING_HEADER_VALUE
      return
    }

    if (this.current === this.WAITING_HEADER_VALUE) {
      if (char === '\r') {
        this.headers[this.headerName] = this.headerValue
      } else if (char === '\n') {
        // 下一个 header
        this.current = this.WAITING_HEADER_NAME
        this.headerName = ''
        this.headerValue = ''
      } else {
        this.headerValue += char
      }
      return
    }

    if (this.current === this.WAITING_HEADER_BLOCK_END) {
      if (char === '\n') {
        this.current = this.WAITING_BODY
        if (this.headers['Transfer-Encoding'] === 'chunked') {
          this.bodyParser = new ChunkedBodyParser()
        }
      }
      return
    }

    if (this.current === this.WAITING_BODY) {
      if (!this.isFinished) this.bodyParser.receiveChar(char)
      return
    }
  }
}

class ChunkedBodyParser {
  constructor() {
    this.WAITING_LENGTH = 0
    this.WAITING_LENGTH_END = 1
    this.READING_CHUNK = 2
    this.WAITING_NEW_LINE = 3
    this.WAITING_NEW_LINE_END = 4

    this.current = this.WAITING_LENGTH
    this.content = []
    this.len = 0
    this.isFinished = false
  }
  receiveChar(char) {
    if (this.current === this.WAITING_LENGTH) {
      if (char === '\r') {
        if (this.len === 0) {
          this.isFinished = true
          return
        }
        this.current = this.WAITING_LENGTH_END
      } else {
        this.len *= 16
        this.len += parseInt(char, 16)
      }
      return
    }

    if (this.current === this.WAITING_LENGTH_END) {
      if (char === '\n') {
        this.current = this.READING_CHUNK
      }
      return
    }

    if (this.current === this.READING_CHUNK) {
      this.content.push(char)
      this.len--

      if (this.len === 0) this.current = this.WAITING_NEW_LINE
      return
    }

    if (this.current === this.WAITING_NEW_LINE) {
      if (char === '\r') this.current = this.WAITING_NEW_LINE_END
      return
    }

    if (this.current === this.WAITING_NEW_LINE_END) {
      // 下一个 chunk
      if (char === '\n') this.current = this.WAITING_LENGTH
      return
    }
  }
}

const req = new Request({
  method: 'POST',
  host: '127.0.0.1',
  port: '8088',
  body: {
    name: 'j',
  },
  headers: {
    [CONTENT_TYPE]: APPLICATION_JSON,
    ['X-My-Header']: 'my-custom-header',
  },
})

async function run() {
  const res = await req.send()

  const dom = parser.parseHTML(res.body)
}

run().catch((err) => console.log(err))
