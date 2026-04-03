#!/usr/bin/env node
const http = require('http')
const assert = require('assert')

function get(path){
  return new Promise((resolve, reject)=>{
    http.get({hostname:'localhost', port:4000, path}, res => {
      let data=''
      res.on('data', chunk => data += chunk)
      res.on('end', ()=> {
        try { resolve(JSON.parse(data)) } catch { resolve({}) }
      })
    }).on('error', reject)
  })
}

async function run(){
  try {
    const r = await get('/api/logs/recent')
    assert(r && typeof r.count === 'number')
    console.log('logs_recent OK', r.count)
  } catch(err){
    console.error('logs_recent test failed', err)
    process.exit(1)
  }
  process.exit(0)
}

run()
