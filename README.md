# Silo NFT Backend

This is generated/hosted with AWS Amplify express serverless architecture.

`amplify push` is how you push it out.

This is normally hosted at:

https://jahxp1n5c6.execute-api.ap-northeast-2.amazonaws.com/dev/api/test

# Testing

This can be tested locally. Navigate to:
`silo-nft-backend/amplify/backend/function/silonftbackend5892e331/src`

Set the env variables first: 
`set -a; source .env.local; set +a`

and then run
`nodemon app.js` (you may have to install nodemon)

# Deployment

Simple! Just run
`amplify push`.

# Amplify secret manager

Go into the lambda, add environment variables directly there.

To get the lambda connected to both the internet and the gateway (which is uniquely hard on Lambdas):

* Create a nat gateway. 
* Created a new subnet. It should be in a CIDR that isn't done before (I did X). It has two routes: X/16 to local; and then 0.0.0.0/0 to the nat gateway. Note that to do this you need to make a route-table that really allows these - you can't edit subnet endpoints directly.






