const net = require('net')

run()

function run() {
  const client = net.createConnection(
    {
      host: '127.0.0.1',
      port: 8088,
    },
    () => {
      // 'connect' listener.
      console.log('>>>connected to server!')
      console.log('')
      // 模拟 HTTP 请求
      const reqText = `POST / HTTP/1.1
      Content-Type: application/x-www-form-urlencoded
      Content-length: 9

      name=jack`

      console.log('>>>reqText')
      console.log(reqText)

      client.write(reqText)
    }
  )

  client.on('data', (data) => {
    console.log('>>>on-data')
    console.log(data.toString())
    client.end()
  })

  client.on('end', () => {
    console.log('>>>on-end')
    console.log('disconnected from server')
  })
}
