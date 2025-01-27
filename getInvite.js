const { JsonRpc, Api, Serialize } = require('eosjs')

const fetch = require('node-fetch')
const util = require('util')
const zlib = require('zlib')
const fs = require('fs').promises;
const nReadlines = require('n-readlines');
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

async function hash_used(hash) {
  if (typeof(rpc) == 'undefined') {
      setNode(default_node)
  }
  const resp = await rpc.get_table_rows({
    json: true,
    code: "join.seeds",
    scope: "join.seeds",
    table: "invites",
    lower_bound: hash,
    limit: 1,
    key_type: "i256",
    index_position: "2",
    encode_type: "dec",
  })
  const res = await resp;
  return (res.rows.length == 0 || res.rows[0].invite_secret != 0);  
}


const validhex = '0123456789abcdef'
const data_path ="data"
async function getNextInvite(account) {
  const file_path = `${data_path}/${account}/invites.csv`
  let output = ""
  let got_one = false
  let got_line
  let rv = {}
  try {
    const invite_table = new nReadlines(file_path)
    let line_buf
    while (line_buf = invite_table.next()) { 
      const line = line_buf.toString('ascii')
      if (line.length == 0) continue
      if (got_one || !validhex.includes(line[0])) {
        output += line + "\n"
      } else {
        [rv.secret, rv.hash, rv.qty] = line.split(',')
        console.log(`${JSON.stringify(rv)}`)
        if ( await hash_used(`0x${rv.hash}`) ) {
          //console.log(`hash already used: ${rv.hash}`)
        } else {
          got_one = true
          got_line = line
        }
      }
    }
  } catch (error) {
    console.error(`Got an error trying to read ${file_path}: ${error.message}`);
  }
  if (!got_one) {
    console.log(`no invites in file ${file_path}`)
  } else {
    try {
      const file = await fs.open(file_path, "w")
      // rotate the issued invite to bottom of table
      output += got_line + "\n"
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

async function serializeActions(actions) {
    if (typeof(rpc) == 'undefined') {
        setNode(default_node);
    }
    const serialized_actions = await eos.serializeActions(actions);
    return serialized_actions;
}

const getit = async () => {
    try {
        invite = await getNextInvite("coinsacct112")
        console.log(`${JSON.stringify(invite)}`)
    } catch (err) {
        console.log(err)
    }
}

async function isFresh(contract, symbol, account, pristine=true) {
  try {
    const resp = await rpc.get_table_rows({
      json: true,
      code: contract,
      scope: account,
      table: "accounts",
      limit: 100,
    })
    const res = await resp;
    const balanceRow = res.rows.find(row => row.balance.includes(symbol));
    return balanceRow === undefined || (!pristine && (parseInt(balanceRow.balance) == 0));
  } catch(err) {
    console.log(err);
    return false;
  }
}

async function getIssuerData(contract, symbol) {
  try {
    const resp = await rpc.get_table_rows({
      json: true,
      code: contract,
      scope: symbol,
      table: "stat",
      limit: 100,
    })
    const res = await resp;
    const sp = res.rows[0].supply.split(" ")[0].split(".");
    var precision;
    if (sp.length == 2) {
      precision = sp[1].length
    } else {
      precision = 0;
    }
    return { issuer: res.rows[0].issuer, precision: precision };
  } catch(err) {
    console.log(err);
    return null;
  }

}

async function getInitData(initBody) {
  if (typeof(rpc) == 'undefined') {
      setNode(default_node)
  }
  var rv = {};
  if(!(await isFresh(initBody.contract, initBody.symbol, initBody.account, initBody.pristine))) {
    rv.err = `initializing ${initBody.account} for ${initBody.symbol}: account is not fresh`;
    return rv;
  }
  var configRow;
  try {
    const resp = await rpc.get_table_rows({
      json: true,
      code: initBody.contract,
      scope: initBody.symbol,
      table: "configs",
      limit: 1,
    })
    const res = await resp;
    configRow = res.rows[0];
  } catch (err) {
    rv.err = `init data error ${err}`
    return rv;
  }
  if (initBody.memtokens !== undefined) {
    if (configRow.membership==null) {
      rv.err = `no member symbol for ${initBody.symbol}`;
      return rv;
    }
    if(!await isFresh(initBody.contract, configRow.membership, initBody.account, initBody.pristine)) {
      rv.err = `initializing ${initBody.account} for member token ${configRow.membership}: account is not fresh`;
      return rv;
    }
    rv.membership = configRow.membership;
    rv.memberdata = await getIssuerData(initBody.contract, rv.membership);
  }
  if (initBody.credtokens !== undefined) {
    if (configRow.cred_limit==null) {
      rv.err = `no credit limit symbol for ${initBody.symbol}`;
      return rv;
    }
    if(!await isFresh(initBody.contract, configRow.cred_limit, initBody.account, initBody.pristine)) {
      rv.err = `initializing ${initBody.account} for credit limit token ${configRow.cred_limit}: account is not fresh`;
      return rv;
    }
    rv.cred_limit = configRow.cred_limit;
    rv.creddata = await getIssuerData(initBody.contract, rv.cred_limit);
  }
  if (initBody.maxtokens !== undefined) {
    if (configRow.max_limit==null) {
      rv.err = `no max limit symbol for ${initBody.symbol}`;
      return rv;
    }
    if(!await isFresh(initBody.contract, configRow.max_limit, initBody.account, initBody.pristine)) {
      rv.err = `initializing ${initBody.account} for max_limit token ${configRow.max_limit}: account is not fresh`;
      return rv;
    }
    rv.max_limit = configRow.max_limit;
    rv.maxdata = await getIssuerData(initBody.contract, rv.max_limit);
  }
  rv.tokendata = await getIssuerData(initBody.contract, initBody.symbol);
  return rv;  
}

//getit()


module.exports = { buildTransaction, setNode, getNextInvite, serializeActions, getInitData }
