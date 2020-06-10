const http = require('http')

const server = http.createServer((req, res) => {
  console.log('request received')
  console.log(req.method, req.url)
  console.log(req.headers)

  res.setHeader('Content-Type', 'text/html')
  res.setHeader('X-Foo', 'bar')
  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end(
    `<html>
<head>
    <style>
        .wrap {
            display: flex;
            width: 500px;
            height: 300px;
            background-color: rgb(255,0,0);
        }
        .box {
            width: 100px;
            height: 100px;
            background-color: rgb(0,255,0);
        }
    </style>
</head>
<body>
    <div class="wrap">
        <div class="box"></div>
    </div>
</body>
</html>`
  )
})

server.listen('8088')
