#!/usr/bin/env node
import fetch from 'node-fetch'

async function run(){
  try {
    const res = await fetch('http://localhost:4000/api/aggregate/summary')
    const data = await res.json()
    if (typeof data.total !== 'undefined'){
      console.log('aggregate_summary', data.total, 'items')
      process.exit(0)
    } else {
      console.error('aggregate_summary missing fields')
      process.exit(1)
    }
  } catch (e) {
    console.error('aggregate_summary error', e)
    process.exit(1)
  }
}

run()
