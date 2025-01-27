## Encode transaction service

A backend service to encode EOS/Telos actions into ESR standard QR codes. 

ESR = EOSIO Signing Request, a standard to encode EOSIO transactions/actions as binary URLs

'''
esr://bdaz4f.... 
'''

QR code is then just a repr

## Installation

```
mkdir images
npm install
```
In a PM2 environment
```
pm2 start index.js
```
Alternatively
```
npm run start
```

## API

```/qr``` for telos mainnet

send 'actions' json in the body to get the QR code
```
curl -H 'Content-Type: application/json' -X 'POST' 'http://127.0.0.1:3000/qr' -d '{ "actions":[{"account":"eosio.token","name":"transfer","data":{"from":"............1",
"to":"myaccount","quantity":"1.0000 TLOS","memo":""},"authorization":[{
"actor":"............1","permission":"............2"}]
}] }'
```


## Tools 

### eosio.to
Shows QR codes for ESR encoded requests

Example:
https://eosio.to/gmNgYmAoCOJiniNoxLDsl571kgUTGRkZEGDFWyMjDpgAkAYA

### greymass URL builder
https://greymass.github.io/eosio-uri-builder/

This creates an ESR encoded string, which can then be looked at in eosio.to, which also shows the QR code.

