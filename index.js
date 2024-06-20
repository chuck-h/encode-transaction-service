const fastify = require('fastify')({ logger: true })
fastify.register(require("fastify-blipp"));
const path = require('path')

const { buildTransaction, setNode, getNextInvite, serializeActions } = require('./getInvite')
const buildQrCode = require('./buildQrCode')

fastify.register(require('fastify-static'), {
    root: path.join(__dirname, 'images'),
    prefix: '/images/', // optional: default '/'
  })

fastify.register(require('point-of-view'), {
    engine: {
        ejs: require('handlebars')
    }
})

fastify.post('/tx', async (request, reply) => {
    const actions = request.body.actions

    setNode(request.body.endpoint ?? 'https://mainnet.telos.net')
    
    const serialized_actions = await serializeActions(actions)

    return serialized_actions;
})

fastify.post('/qr', async (request, reply) => {
    const actions = request.body.actions

    setNode(request.body.endpoint ?? 'https://mainnet.telos.net')
    
    const esr = await buildTransaction(actions)

    const qrPath = await buildQrCode(esr)
    
    const qr = "https://" + request.hostname + "/" + qrPath

    return {
        esr, qr
    }
})

fastify.get('/invoice', async (request, reply) => {

    if (!request.query.to) {
        throw Error("to needs to be defined")
    }
    if (!request.query.quantity) {
        throw Error("quantity needs to be defined")
    }
    if (!request.query.memo) {
        throw Error("memo needs to be defined")
    }

    let tokenContract = request.query.tokenContract || "token.seeds"
    let digits = request.query.digitsPrecision || 4
    let symbol = request.query.tokenSymbol || "SEEDS"
    var quantity = parseFloat(request.query.quantity).toFixed(digits) + " " + symbol

    var actions = [{
        account: tokenContract,
        name: "transfer",
        authorization: [{
            actor:"............1",
            permission: "............2"
        }
        ],
        data: {
            from:"............1",
            "to": request.query.to,
            "quantity": quantity,
            memo: request.query.memo
        }
    }]

    if (request.query.justonce) {
        actions = [ ...actions, {
        account: "doitjustonce",
        name: "antirepeat",
        authorization: [{
            actor:"............1",
            permission: "............2"
        }
        ],
        data: {
            "nonce": request.query.justonce,
            "lifetime_sec": 30,
            "scope": request.query.to,
            "ram_payer": "............1",
        }
        }]
    }
           
    const esr = await buildTransaction(actions)

    const qrPath = await buildQrCode(esr)
    
    const qr = "https://" + request.hostname + "/" + qrPath

    return {
        esr, qr
    }
})

const onboardingContract = "join.seeds"

fastify.post('/join', async (request, reply) => {

    setNode(request.body.endpoint ?? 'https://mainnet.telos.net')
 
    const secret = (await getNextInvite(request.body.sponsor)).secret
    if (secret == null) {
      throw new Error(`no invites available from ${request.body.sponsor}`)
    }
    console.log(`secret ${secret}`)
    const actions = [{
        account: onboardingContract,
        name: "acceptexist",
        authorization: [{
            actor:"............1",
            permission: "............2"
        }
        ],
        data: {
            account: "............1",
            invite_secret: secret,
        }
    }]

    const esr = await buildTransaction(actions)

    const qrPath = await buildQrCode(esr)
    
    const qr = "https://" + request.hostname + "/" + qrPath

    return {
        esr, qr
    }
})


const start = async () => {
    try {
        await fastify.listen(3000) 
    } catch (err) {
        fastify.log.error(err)
        process.exit(1)
    }
}

start()
