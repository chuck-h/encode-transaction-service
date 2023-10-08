const { JsonRpc, Api, Serialize } = require('eosjs')

const fetch = require('node-fetch')
const util = require('util')
const zlib = require('zlib')
const fs = require('fs').promises;
//const helper = require('./helper')

const { SigningRequest } = require("eosio-signing-request")

const textEncoder = new util.TextEncoder()
const textDecoder = new util.TextDecoder()

var rpc
var eos
var opts

const default_node = 'https://mainnet.telos.net'

function setNode(node) {
    rpc = new JsonRpc(node, {
        fetch
    })

    eos = new Api({
        rpc,
        textDecoder,
        textEncoder,
    })

    opts = {
        textEncoder,
        textDecoder,
        zlib: {
            deflateRaw: (data) => new Uint8Array(zlib.deflateRawSync(Buffer.from(data))),
            inflateRaw: (data) => new Uint8Array(zlib.inflateRawSync(Buffer.from(data))),
        },
        abiProvider: {
            getAbi: async (account) => (await eos.getAbi(account))
        }
    } 
}

const validhex = '0123456789abcdef'
const data_path ="data"
async function getNextInvite(account) {
  const file_path = `${data_path}/${account}/invites.csv`
  let output = ""
  let got_one = false
  let rv = {}
  try {
    file = await fs.open(file_path)
    for await (const line of file.readLines()) {
      if (got_one || !validhex.includes(line[0])) {
        //console.log(`skip ${line}`)
        output += line + "\n"
      } else {
        [rv.secret, rv.hash, rv.qty] = line.split(',')
        //console.log(`${JSON.stringify(rv)}`)
        got_one = true
      }
    }
    await file.close()
  } catch (error) {
    console.error(`Got an error trying to read ${file_path}: ${error.message}`);
  }
  if (!got_one) {
    console.log(`no invites in file ${file_path}`)
  } else {
    try {
      file = await fs.open(file_path, "w")
      await file.write(output)
      await file.close()
    } catch (error) {
      console.error(`Got an error trying to update ${file_path}: ${error.message}`);
    }
  }
  return rv
}
async function buildTransaction(actions) {
    if (typeof(rpc) == 'undefined') {
        setNode(default_node)
    }
    const info = await rpc.get_info();
    const head_block = await rpc.get_block(info.last_irreversible_block_num);
    const chainId = info.chain_id;
    // set to an hour from now.
    const expiration = Serialize.timePointSecToDate(Serialize.dateToTimePointSec(head_block.timestamp) + 3600)
    const transaction = {
        expiration,
        ref_block_num: head_block.block_num & 0xffff, // 
        ref_block_prefix: head_block.ref_block_prefix,
        max_net_usage_words: 0,
        delay_sec: 0,
        context_free_actions: [],
        actions: actions,
        transaction_extensions: [],
        signatures: [],
        context_free_data: []
    };
    const request = await SigningRequest.create({ transaction, chainId }, opts);
    const uri = request.encode();
    return uri
}

const getit = async () => {
    try {
        invite = await getNextInvite("coinsacct112")
        console.log(`${JSON.stringify(invite)}`)
    } catch (err) {
        console.log(err)
    }
}


//getit()


module.exports = { buildTransaction, setNode, getNextInvite }
