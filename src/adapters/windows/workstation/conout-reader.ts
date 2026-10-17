import { workerData, parentPort } from 'node:worker_threads'
import { Socket, createServer } from 'node:net'
const { pipe } = workerData
const source = new Socket({ highWaterMark: 16384 } as any)
source.on('error', error => { throw error })
source.connect(pipe, () => {
  const server = createServer(destination => {
    server.close()
    destination.on('error', error => { throw error })
    source.pipe(destination)
    destination.on('finish', () => { destination.destroy(); source.destroy(); parentPort?.close() })
  })
  server.on('error', error => { throw error })
  server.listen(pipe + '-worker', () => parentPort!.postMessage('ready'))
})
