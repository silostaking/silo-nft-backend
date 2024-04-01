/*
Copyright 2017 - 2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.
Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance with the License. A copy of the License is located at
    http://aws.amazon.com/apache2.0/
or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and limitations under the License.
*/




const express = require('express')
const bodyParser = require('body-parser')
const awsServerlessExpressMiddleware = require('aws-serverless-express/middleware')
const fetch = require('node-fetch');

const { Pool } = require('pg');


const pool = new Pool({
  user: "postgres",
  host: process.env.DB_HOST,
  database: "postgres",
  password: process.env.DB_PASSWORD,
  port: 5432,
  ssl: {
    rejectUnauthorized: false, // Note: Setting rejectUnauthorized to false might expose you to security risks, ideally provide the CA cert
  }
});

// declare a new express app
const app = express()
app.use(bodyParser.json())
app.use(awsServerlessExpressMiddleware.eventContext())

const port = 3000; // Change this to your preferred port

// Replace these with your Discord application's details
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const API_KEY = process.env.API_KEY;
const hotUrl = process.env.HOT_URL;
const roomUrl = process.env.ROOM_URL;

const redirectUriDict = {
  'ice': 'http://localhost:8080',
  'hot': hotUrl,
  'room': roomUrl,
}

// Enable CORS for all methods
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*")
  res.header("Access-Control-Allow-Headers", "*")
  next()
});

// Sample dictionary for puzzle validation

const puzzleDictionary = {
  1: { key: 'zjxljozdfias0e9a-w0e', answer: ['fast red chain good'] }, // Swirl
  2: { key: 'izpxocvopizxiopoipzsdfi0', answer: ['farmors love digging'] }, // Digging
  3: { key: '09z8w39as90ef0dfoi23i4oljaldf', answer: ['hat', 'headwear', 'cap'] }, // Block
  4: { key: 'osapwoezxdklfjzdsfripaower234', answer: ['plant in the spring to harvest crops in sei summer'] }, // Silence
  5: { key: 'zxjifw90era90werszdiofipozspower', answer: ['community'] }, // History
  6: { key: 'zxiodaopawe0riwapeorwpowaeear', answer: ['6zopidfipoewirpoawe90234'] }, // Friends
  7: { key: 'piozsipozxodpifiopzdfrzew90w34', answer: ['farmors are family', 'family', 'amil'] }, // Reflections
  // Add more puzzles as needed
};

/**********************
 * Example get method *
 **********************/

app.get('/api', function(req, res) {
  // Add your code here
  res.json({success: 'Pong!', url: req.url});
});

app.get('/api/digging', async function(req, res) {
  // Add your code here
  const dig_count = req.query.dig_count;
  try {
    const insertQuery = 'INSERT INTO dig(dig_count, created_timestamp) VALUES($1, NOW())';
    await pool.query(insertQuery, [dig_count]);
  } catch (error) {
    console.log("Error saving to db", error);
    console.error("ERror saving to database:", error);
    res.status(500).send("Failed to save the guess");
  }

  res.json({success: 'Dig!!', url: req.url});

});

function check_correct(puzzleNumber, puzzleKey, puzzleAnswer) {
  // Sees if the user answer is right.
  if (!puzzleDictionary[puzzleNumber]) {
    console.log("Invalid puzzle number")
    return {'result': false, 'reason': "invalid number"}
  }
  const dictionaryKey = puzzleDictionary[puzzleNumber].key.replace(/\s+/g, '').toLowerCase();
  const userKey = puzzleKey.replace(/\s+/g, '').toLowerCase();
  if (dictionaryKey != userKey) {
    console.log("Invalid puzzle key", userKey, dictionaryKey)
    return {'result': false, 'reason': "invalid key"}
  }

  const userAnswer = puzzleAnswer.replace(/\s+/g, '').toLowerCase();
  // Normalize and check each possible answer in the list against the user's answer
  for (const possibleAnswer of puzzleDictionary[puzzleNumber].answer) {
    if (possibleAnswer.replace(/\s+/g, '').toLowerCase() === userAnswer) {
      console.log("User is correct");
      return {'result': true, 'reason': "correct"};
    }
  }
  console.log("Invalid answer")
  return {'result': false, 'reason': "invalid answer"};
}


// We can remove the async and await if we want to make this faster.
app.post('/api/answer', async function(req, res) {
  const { puzzleNumber, puzzleKey, puzzleAnswer} = req.body;

  console.log("DB")
  // Print the decoded arguments to the console
  console.log(`Puzzle Number: ${puzzleNumber}, Puzzle Key: ${puzzleKey}, Puzzle Answer: ${puzzleAnswer}`);
  // Check if the puzzle exists and the keys match

  let response = check_correct(puzzleNumber, puzzleKey, puzzleAnswer)

  try {
    const insertQuery = 'INSERT INTO guesses(puzzle, guess, timestamp, correct) VALUES($1, $2, NOW(), $3)';
    let res = await pool.query(insertQuery, [puzzleNumber, puzzleAnswer, true]);
  } catch (error) {
    console.log("Error saving to db", error);
    console.error("ERror saving to database:", error);
    res.status(500).send("Failed to save the guess");
  }

  if (response.reason == 'correct') {
    res.json({"response": "success"});
    return
  } else {
    res.json({"response": "failure", "reason": response.reason})
    return
  }
});

const { SigningCosmWasmClient } = require("@cosmjs/cosmwasm-stargate");

async function fetchAllTokens(client, collection, walletAddress) {
  let allTokens = [];
  let startAfter = undefined;
  const limit = 10;

  try {
    while (true) {
      const result = await client.queryContractSmart(collection, {
        tokens: {
          owner: walletAddress,
          start_after: startAfter,
          limit: limit,
        },
      });

      if (result.tokens.length === 0) {
        break;
      }

      allTokens = allTokens.concat(result.tokens);

      if (result.tokens.length < limit) {
        break;
      }

      startAfter = result.tokens[result.tokens.length - 1];
    }
  } catch (e) {
    console.error("Error fetching tokens:", e);
    throw e; // Make sure to propagate the error
  }

  return allTokens;
}

// Endpoint to fetch NFTs for a given address
app.post('/fetch-nfts', async (req, res) => {
  const { collection, walletAddress, rpc } = req.body;

  if (!collection || !walletAddress || !rpc) {
    return res.status(400).send({ error: 'Missing required parameters.' });
  }

  try {
    const client = await SigningCosmWasmClient.connect(rpc);
    const allTokens = await fetchAllTokens(client, collection, walletAddress);

    const isei_balance = await getISEIBalance(client, walletAddress)

    const pool_balance = await getPoolBalance(client, walletAddress)

    const total_balance = isei_balance + 2 * pool_balance

    res.json(
      { 'nfts': allTokens, 'isei': isei_balance, 'pool': pool_balance, 'total': total_balance });
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: 'Failed to fetch tokens.' });
  }
});

// Function adapted to accept a wallet address and return the token balance
async function getISEIBalance(client, walletAddress) {
  const contractAddress = "sei1e3gttzq5e5k49f9f5gzvrl0rltlav65xu6p9xc0aj7e84lantdjqp7cncc";
  if (!client) {
    throw new Error('CosmWasm client is not initialized');
  }

  const balance = await client.getBalance(
    walletAddress,
    `factory/${contractAddress}/isei`
  );

  return Number(balance.amount);
}

async function findWalletNFTCollections(client, collections, walletAddress) {
  const ownedCollections = [];

  for (const [collectionKey, collectionAddress] of Object.entries(collections)) {
    const allTokens = await fetchAllTokens(client, collectionAddress, walletAddress);
    if (allTokens.length > 0) {
      // If the wallet has any NFTs in this collection, add the key to the list
      ownedCollections.push(collectionKey);
    }
  }

  return ownedCollections;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function process_user(discord_username, address) {
  const RPC_ADDRESS = "https://rpc.sei-apis.com";
  const collections = {
    'Seiyans': 'sei1g2a0q3tddzs7vf7lk45c2tgufsaqerxmsdr2cprth3mjtuqxm60qdmravc',
    'The Colony': 'sei1pkteljh83a83gmazcvam474f7dwt9wzcyqcf5puxvqqs6jcx8nnq2y74lu',
    'WeBump': 'sei1v90ly54qeu7497lzk2mnmp2h29sgtep8hs5ryvfqf8dwq5gc0t9srp6aey',
    'Dob': 'sei13zrt6ts27fd7rl3hfha7t63udghm0d904ds68h5wsvkkx5md9jqqkd7z5j',
    'Yaka Voyager': 'sei1wzhrqprfpxagkrxz9fspmnrtc0fqusk5g6ynpezcl705sfqs55nqscej0k',
    'Cappys': 'sei1cujl8ujhc36lp7sr98x30u0aeqtjlj68kll5rqqr9dke5xvn2ltquzhysl',
    'Outlines': 'sei1x50tc96nhw24aytsa4rlrf4un36j9ug5ualz3n320u5g5jd23gpqc4arta',
    'Seiyan by Cult': 'sei1za9z9l8pwueataj5gx7mwt8g5zrndhjls7yr6tnhan0zlgw2r8fszn5089',
    'Seilors': 'sei19lsam8qjj3jacfhsuqnn7zsc9326uje8qp96neukhaxyjtk3pkhs366058',
    'Alive1111': 'sei1zjqml63xh7cfjxfe229v9c7krx05ytlz22y3cpf09wz83xck5q9qu73y03',
    'Sei Fuckers': 'sei1lqsrwexmpve6ltu8pga8ss0jzvgx9r88n6ys9fedjk6dqny72h3q7myv5d',
    'Seimen': 'sei1cnktx4rr8mlyr09hw3u4l8vrrpv6qtght3zcdpzhlf29fq2enluqlpndct',
    'The Sei Whales': 'sei1yp8xsk8q06hd5cm6pknd2kfumkkrrucswjsvga70rrxqqa5lp27q9vea7n',
  }

  try {
    console.log(`Received discord username and address:`, discord_username, address)

    const userQuery = 'SELECT user_id FROM users WHERE discord_username = $1';
    const userRes = await pool.query(userQuery, [discord_username]);
    if (userRes.rows.length === 0) {
      return {"error": "User Not Found"}
    }
    const userId = userRes.rows[0].user_id;

    const client = await SigningCosmWasmClient.connect(RPC_ADDRESS);

    const nfts = await findWalletNFTCollections(client, collections, address);

    const uisei = await getISEIBalance(client, address);
    const pool_balance = await getPoolBalance(client, address);

    const total_balance = uisei + 2 * pool_balance;

    const isei_count = Math.floor(total_balance / 10**6);

    const insertQuery = 'INSERT INTO nft_submissions(user_id, sei_address, isei_count, nfts, updated_time) VALUES($1, $2, $3, $4, NOW())';
    await pool.query(insertQuery, [userId, address, isei_count, nfts]);
    console.log(`Saved info for`, discord_username, ` isei: `, isei_count);
    return {"response": "success", "isei": isei_count, "nfts": nfts}
  } catch (error) {
    console.log("Error interacting with the database", error);
    return {"error": `Error with DB for ${discord_username}`}
  }
}




app.post('/api/nfts', async function(req, res) {
  const { discord_username, address } = req.body;

  let result = await process_user(discord_username, address);

  if (result.error) {
    if (result.error == 'User Not Found') {
      return res.status(404).send("User not found");
    } else {
      return res.status(500).end("Failed to process the submission.");
    }
  }

  res.json({"response": "success", "isei": result.isei, "nfts": result.nfts})
});

async function processUsersWithDelay(users) {
    const results = [];

    for (const user of users) {
        const result = await process_user(user.discord_username, user.address)
            .then(result => ({ status: 'fulfilled', value: result }))
            .catch(reason => ({ status: 'rejected', reason }));
        results.push(result);

        // Wait for 0.5 seconds (500 milliseconds) before processing the next user
        await delay(500);
    }

    return results;
}


app.post('/api/batch-nfts', async function(req, res) {
  const users = req.body; // Expecting an array of { discord_username, address }

  const results = await processUsersWithDelay(users) //.map(user => process_user(user.discord_username, user.address)))
  //const results = await Promise.allSettled(users.map(user => process_user(user.discord_username, user.address)));

  const processedResults = results.map(result => {
    if (result.status === 'fulfilled') {
      if (result.value.error) {
        // Handle error case
         return {"error": true, "message": result.value.error}
      } else if (result.value.response) {
        // Handle success case
        return {"error": false, "message": result.value.response}
      }
    } else {
      // Handle case where Promise.allSettled itself encounters an error (e.g., rejection)
      return { error: true, message: 'Unexpected error processing user' };
    }
  });

  // Now, send a response to the client
  // For example, separate the success and error cases for the client
  const errors = processedResults.filter(result => result.error);
  const successes = processedResults.filter(result => !result.error);

  if (errors.length > 0) {
    // Respond with errors if any
    res.status(400).json({ errors, successes: successes.length });
  } else {
    // Respond with success message
    res.json({ message: "All users processed successfully", count: successes.length });
  }
});

async function getUsersInfo(submissions) {
    // Use Promise.all to handle all the database queries in parallel
    const userInfoPromises = submissions.map(submission => {
        return pool.query('SELECT discord_username FROM users WHERE user_id = $1', [submission.user_id]);
    });

    // Await all promises to resolve
    const userInfoResults = await Promise.all(userInfoPromises);

    // Construct the final list by combining sei_address from submissions and discord_username from query results
    const finalList = submissions.map((submission, index) => {
        const discord_username = userInfoResults[index].rows[0].discord_username;
        return {
            discord_username,
            address: submission.sei_address
        };
    });

    return finalList;
}

async function get_refresh_list() {
  // Returns the arry of all the users to refresh.
  let result = await get_cleaned_nft_submissions();
  let new_res = await getUsersInfo(result.rows);
  return new_res
}

app.get('/api/nft-get-refresh-list', async function(req, res) {
  const api_sent_in = req.query.apiKey;
  if (api_sent_in != API_KEY) {
    res.status(500).send("Failed to retrieve users.");
    return
  }
  let new_res = await get_refresh_list()
  res.json(new_res);
  return

});


app.get('/api/nfts', async (req, res) => {

  const api_sent_in = req.query.apiKey;
  if (api_sent_in != API_KEY) {
    res.status(500).send("Failed to retrieve users.");
    return
  }

  try {
    const getAllSubmissionsQuery = 'SELECT * FROM nft_submissions';
    const usersRes = await pool.query(getAllSubmissionsQuery);

    res.json(usersRes.rows);
  } catch (error) {
    res.status(500).send("Failed to retrieve nfts");
  }
});

async function scoreNFTCollections() {
  const getNFTsAndCountsQuery = `
  WITH LatestUserSubmission AS (
    SELECT
      user_id,
      sei_address,
      MAX(updated_time) AS latest_time
    FROM
      public.nft_submissions
    GROUP BY
      user_id, sei_address
  ), MaxUserSubmission AS (
    SELECT
      user_id,
      MAX(latest_time) AS max_time
    FROM
      LatestUserSubmission
    GROUP BY
      user_id
  ), LatestSeiAddressPerUser AS (
    SELECT
      lus.user_id,
      lus.sei_address
    FROM
      LatestUserSubmission lus
      JOIN MaxUserSubmission mus ON lus.user_id = mus.user_id AND lus.latest_time = mus.max_time
  ), FinalSubmissions AS (
    SELECT
      ns.*
    FROM
      public.nft_submissions ns
      JOIN LatestSeiAddressPerUser laspu ON ns.user_id = laspu.user_id AND ns.sei_address = laspu.sei_address
      JOIN (
        SELECT
          sei_address,
          MAX(updated_time) AS max_time
        FROM
          public.nft_submissions
        GROUP BY
          sei_address
      ) as LatestSubmission ON ns.sei_address = LatestSubmission.sei_address AND ns.updated_time = LatestSubmission.max_time
  )
  SELECT
    unnest(nfts) AS nft_name,
    SUM(isei_count) AS total_isei_count
  FROM
    FinalSubmissions
  GROUP BY
    nft_name
  ORDER BY
    total_isei_count DESC;
      `;
    const result = await pool.query(getNFTsAndCountsQuery);
    
    // Convert the array of rows into a dictionary format
    const nftRanking = result.rows.reduce((acc, row) => {
      acc[row.nft_name] = row.total_isei_count;
      return acc;
    }, {});
    return nftRanking
}

app.get('/api/nft-ranking', async (req, res) => {
  try {

    const nftRanking = await scoreNFTCollections();
    
    res.json(nftRanking);
  } catch (error) {
    console.error(error);
    res.status(500).send("Failed to retrieve NFT rankings");
  }
});

// Now we need a function to update all the nfts.

async function get_cleaned_nft_submissions() {
  const getNFTsAndCountsQuery = `
WITH LatestUserSubmission AS (
  SELECT
    user_id,
    sei_address,
    MAX(updated_time) AS latest_time
  FROM
    public.nft_submissions
  GROUP BY
    user_id, sei_address
), MaxUserSubmission AS (
  SELECT
    user_id,
    MAX(latest_time) AS max_time
  FROM
    LatestUserSubmission
  GROUP BY
    user_id
), LatestSeiAddressPerUser AS (
  SELECT
    lus.user_id,
    lus.sei_address,
    lus.latest_time
  FROM
    LatestUserSubmission lus
    JOIN MaxUserSubmission mus ON lus.user_id = mus.user_id AND lus.latest_time = mus.max_time
), FinalSubmissions AS (
  SELECT
    ns.nft_submission_id,
    ns.sei_address,
    ns.user_id,
    ns.isei_count,
    ns.nfts,
    ns.updated_time
  FROM
    public.nft_submissions ns
    JOIN LatestSeiAddressPerUser laspu ON ns.user_id = laspu.user_id AND ns.sei_address = laspu.sei_address
    JOIN (
      SELECT
        sei_address,
        MAX(updated_time) AS max_time
      FROM
        public.nft_submissions
      GROUP BY
        sei_address
    ) as LatestSubmission ON ns.sei_address = LatestSubmission.sei_address AND ns.updated_time = LatestSubmission.max_time
)
SELECT * FROM FinalSubmissions;
    `;
    const result = await pool.query(getNFTsAndCountsQuery);
    return result
}


app.get('/api/nft-ranking-cleaned-submissions', async (req, res) => {
  const api_sent_in = req.query.apiKey;
  if (api_sent_in != API_KEY) {
    res.status(500).send("Failed to retrieve users.");
    return
  }

  try {
    let result = await get_cleaned_nft_submissions()

    return res.json(result.rows);

  } catch (error) {
    console.error(error);
    res.status(500).send("Failed to retrieve NFT rankings");
  }
});

app.get('/api/nft-ranking-submitted', async (req, res) => {
  const discord_username = req.query.discord_username;

  console.log(`querying for user`, discord_username);

  const userQuery = 'SELECT user_id FROM users WHERE discord_username = $1';
  const userRes = await pool.query(userQuery, [discord_username]);
  if (userRes.rows.length === 0) {
    return res.status(404).send("User not found");
  }
  const userId = userRes.rows[0].user_id;

  console.log(`BIg query`)

  try {
    const getNFTsAndCountsQuery = `
WITH LatestUserSubmission AS (
  SELECT
    user_id,
    sei_address,
    MAX(updated_time) AS latest_time
  FROM
    public.nft_submissions
  GROUP BY
    user_id, sei_address
), MaxUserSubmission AS (
  SELECT
    user_id,
    MAX(latest_time) AS max_time
  FROM
    LatestUserSubmission
  GROUP BY
    user_id
), LatestSeiAddressPerUser AS (
  SELECT
    lus.user_id,
    lus.sei_address,
    lus.latest_time
  FROM
    LatestUserSubmission lus
    JOIN MaxUserSubmission mus ON lus.user_id = mus.user_id AND lus.latest_time = mus.max_time
), FinalSubmissions AS (
  SELECT
    ns.nft_submission_id,
    ns.sei_address,
    ns.user_id,
    ns.isei_count,
    ns.nfts,
    ns.updated_time
  FROM
    public.nft_submissions ns
    JOIN LatestSeiAddressPerUser laspu ON ns.user_id = laspu.user_id AND ns.sei_address = laspu.sei_address
    JOIN (
      SELECT
        sei_address,
        MAX(updated_time) AS max_time
      FROM
        public.nft_submissions
      GROUP BY
        sei_address
    ) as LatestSubmission ON ns.sei_address = LatestSubmission.sei_address AND ns.updated_time = LatestSubmission.max_time
)
SELECT * FROM FinalSubmissions WHERE user_id=$1;
    `;
    const result = await pool.query(getNFTsAndCountsQuery, [userId]);

    if (result.rows.length > 0) {
      return res.json({"submitted": true})
    } else {
      return res.json({"submitted": false})
    }
  } catch (error) {
    console.error(error);
    res.status(500).send("Failed to retrieve NFT rankings");
  }

});

app.get('/api/nft-ranking-cleaned-submissions-individual', async (req, res) => {

  const api_sent_in = req.query.apiKey;
  if (api_sent_in != API_KEY) {
    res.status(500).send("Failed to retrieve users.");
    return
  }

  const discord_username = req.query.discord_username;

  const userQuery = 'SELECT user_id FROM users WHERE discord_username = $1';
  const userRes = await pool.query(userQuery, [discord_username]);
  if (userRes.rows.length === 0) {
    return res.status(404).send("User not found");
  }
  const userId = userRes.rows[0].user_id;

  try {
    const getNFTsAndCountsQuery = `
WITH LatestUserSubmission AS (
  SELECT
    user_id,
    sei_address,
    MAX(updated_time) AS latest_time
  FROM
    public.nft_submissions
  GROUP BY
    user_id, sei_address
), MaxUserSubmission AS (
  SELECT
    user_id,
    MAX(latest_time) AS max_time
  FROM
    LatestUserSubmission
  GROUP BY
    user_id
), LatestSeiAddressPerUser AS (
  SELECT
    lus.user_id,
    lus.sei_address,
    lus.latest_time
  FROM
    LatestUserSubmission lus
    JOIN MaxUserSubmission mus ON lus.user_id = mus.user_id AND lus.latest_time = mus.max_time
), FinalSubmissions AS (
  SELECT
    ns.nft_submission_id,
    ns.sei_address,
    ns.user_id,
    ns.isei_count,
    ns.nfts,
    ns.updated_time
  FROM
    public.nft_submissions ns
    JOIN LatestSeiAddressPerUser laspu ON ns.user_id = laspu.user_id AND ns.sei_address = laspu.sei_address
    JOIN (
      SELECT
        sei_address,
        MAX(updated_time) AS max_time
      FROM
        public.nft_submissions
      GROUP BY
        sei_address
    ) as LatestSubmission ON ns.sei_address = LatestSubmission.sei_address AND ns.updated_time = LatestSubmission.max_time
)
SELECT * FROM FinalSubmissions WHERE user_id=$1;
    `;
    const result = await pool.query(getNFTsAndCountsQuery, [userId]);

    return res.json(result.rows);

  } catch (error) {
    console.error(error);
    res.status(500).send("Failed to retrieve NFT rankings");
  }
});

async function get_ranking_cleaned_submission_points(winning_collection) {

  const getNFTsAndCountsQuery = `
WITH LatestUserSubmission AS (
SELECT
  user_id,
  sei_address,
  MAX(updated_time) AS latest_time
FROM
  public.nft_submissions
GROUP BY
  user_id, sei_address
), MaxUserSubmission AS (
SELECT
  user_id,
  MAX(latest_time) AS max_time
FROM
  LatestUserSubmission
GROUP BY
  user_id
), LatestSeiAddressPerUser AS (
SELECT
  lus.user_id,
  lus.sei_address,
  lus.latest_time
FROM
  LatestUserSubmission lus
  JOIN MaxUserSubmission mus ON lus.user_id = mus.user_id AND lus.latest_time = mus.max_time
), FinalSubmissions AS (
SELECT
  ns.nft_submission_id,
  ns.sei_address,
  ns.user_id,
  ns.isei_count,
  ns.nfts,
  ns.updated_time
FROM
  public.nft_submissions ns
  JOIN LatestSeiAddressPerUser laspu ON ns.user_id = laspu.user_id AND ns.sei_address = laspu.sei_address
  JOIN (
    SELECT
      sei_address,
      MAX(updated_time) AS max_time
    FROM
      public.nft_submissions
    GROUP BY
      sei_address
  ) as LatestSubmission ON ns.sei_address = LatestSubmission.sei_address AND ns.updated_time = LatestSubmission.max_time
)
SELECT
user_id,
isei_count,
CASE
  WHEN $1 = ANY(nfts) THEN 1
  ELSE 2
END AS priority
FROM
FinalSubmissions
ORDER BY
CASE WHEN isei_count = 0 THEN 1 ELSE 0 END,
priority,
isei_count DESC;
  `;
  const result = await pool.query(getNFTsAndCountsQuery, [winning_collection]);
    return result

}


app.get('/api/nft-ranking-cleaned-submissions-points', async (req, res) => {

  const api_sent_in = req.query.apiKey;
  if (api_sent_in != API_KEY) {
    res.status(500).send("Failed to retrieve users.");
    return
  }

  try {
    const winning_collection = req.query.winning_collection;
    let result = await get_ranking_cleaned_submission_points(winning_collection);
    const final_result = result.rows
    console.log(final_result);
    res.json(final_result);
  } catch (error) {
    console.error(error);
    res.status(500).send("Failed to retrieve NFT rankings");
  }
});

async function insertSubmissions(records) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN'); // Start a transaction
   await client.query('DELETE FROM submissions WHERE puzzle_num = 6;');
    let currentTime = new Date(); // Get the current time

    for (const record of records) {
      // Prepare the query with the current record's details and the adjusted solve_time
      const insertQuery = 'INSERT INTO submissions(user_id, puzzle_num, solve_time) VALUES($1,6, $2)';
      // Execute the insert query with parameters
      let tres = await client.query(insertQuery, [record.user_id, currentTime]);

      // Increment the currentTime by 1 second for each record to ensure ordering
      currentTime = new Date(currentTime.getTime() + 1000);
    }

    let res = await client.query('COMMIT'); // Commit the transaction
  } catch (error) {
    await client.query('ROLLBACK'); // Rollback the transaction on error
    throw error;
  } finally {
    client.release(); // Release the client back to the pool
  }
}

app.post('/api/nft-ranking-cleaned-submissions-points-to-database', async (req, res) => {
  const should_save = req.query.should_save == 'true'
  const api_sent_in = req.query.apiKey;
  if (api_sent_in != API_KEY) {
    res.status(500).send("Failed to retrieve users.");
    return
  }
  // As of now we have to say which collection wins.

  const nftRanking = await scoreNFTCollections();
  // Get the first element.

  const winning_collection = Object.keys(nftRanking)[0] || '';
  console.log("Winning NFT Collection", winning_collection);


  let result = await get_ranking_cleaned_submission_points(winning_collection);
  const records = result.rows


  if (should_save) {
    console.log("Saving...>")
    await insertSubmissions(records)
    console.log("All saved")
  }

  res.json({'result': 'success', 'records': records});

});


app.post('/api/submission', async function(req, res) {
  const { puzzleNumber, puzzleKey, puzzleAnswer, username } = req.body;
  return res.json({"response": "Puzzle has finished."})

  try {
    // Check if the user exists and get their user_id
    const userQuery = 'SELECT user_id FROM users WHERE discord_username = $1';
    const userRes = await pool.query(userQuery, [username]);
    if (userRes.rows.length === 0) {
      return res.status(404).send("User not found");
    }
    const userId = userRes.rows[0].user_id;

    // Check if the user has already submitted an answer for this puzzle
    const submissionCheckQuery = 'SELECT * FROM submissions WHERE puzzle_num = $1 AND user_id = $2';
    const submissionCheckRes = await pool.query(submissionCheckQuery, [puzzleNumber, userId]);
    if (submissionCheckRes.rows.length > 0) {
      return res.status(409).send("You have already submitted an answer for this puzzle");
    }

    let response = check_correct(puzzleNumber, puzzleKey, puzzleAnswer)

    // Insert the submission record
    if (response.reason == 'correct') {
      const insertQuery = 'INSERT INTO submissions(user_id, puzzle_num, solve_time) VALUES($1, $2, NOW())';
      await pool.query(insertQuery, [userId, puzzleNumber]);

      // Count the number of entries for this puzzle
      const countQuery = 'SELECT COUNT(*) AS entry_count FROM submissions WHERE puzzle_num = $1';
      const countRes = await pool.query(countQuery, [puzzleNumber]);
      const entryCount = countRes.rows[0].entry_count;
      if (!entryCount) {
        entryCount = 1
      }

      res.json({"response": "success", "entriesForPuzzle": entryCount});
    } else {
      res.json({"response": response.reason});
    }
  } catch (error) {
    console.log("Error interacting with the database", error);
    res.status(500).send("Failed to process the submission");
  }
});

/***
 * Guess Methods
 **/

app.get('/api/guesses', async (req, res) => {
  // Gaurd this with an apiKey
  const api_sent_in = req.query.apiKey;
  if (api_sent_in != API_KEY) {
    res.status(500).send("Failed to retrieve users.");
    return
  }


  try {
    const getAllUsersQuery = 'SELECT * FROM guesses';
    const usersRes = await pool.query(getAllUsersQuery);

    res.json(usersRes.rows);
  } catch (error) {
    res.status(500).send("Failed to retrieve users");
  }
});

/** Submissions
 * 
 */

app.get('/api/submission', async (req, res) => {
  const api_sent_in = req.query.apiKey;
  if (api_sent_in != API_KEY) {
    res.status(500).send("Failed to retrieve users.");
    return
  }

  try {
    const getAllSubmissionsQuery = 'SELECT * FROM submissions';
    const usersRes = await pool.query(getAllSubmissionsQuery);

    res.json(usersRes.rows);
  } catch (error) {
    res.status(500).send("Failed to retrieve users");
  }
});

/** Rankings
 * 
 */

app.get('/api/rankings', async function(req, res) {
  try {
    // SQL to calculate rank for each puzzle submission by each user
    let query = `
      SELECT u.discord_username,
             s.puzzle_num,
             RANK() OVER (PARTITION BY s.puzzle_num ORDER BY s.solve_time ASC) AS rank
      FROM submissions s
      JOIN users u ON s.user_id = u.user_id
      ORDER BY s.puzzle_num, rank;
    `;

    const result = await pool.query(query);
    
    // Transform the result into the desired format
    let rankings = {};
    result.rows.forEach(row => {
      if (!rankings[row.discord_username]) {
        rankings[row.discord_username] = {username: row.discord_username};
      }
      rankings[row.discord_username][`puzzle_${row.puzzle_num}_rank`] = row.rank;
    });

    function calculateScoreOld(rank) {
      if (rank === 1) {
          return 100;
      } else if (rank === 2) {
          return 75;
      } else if (rank === 3) {
          return 50;
      } else if (rank < 50) {
          return 25;
      } else {
        return 10;
      }
    }

    function calculateScore(rank) {
      if (rank === 1) {
          return 100;
      } else if (rank === 2) {
          return 75;
      } else if (rank === 3) {
          return 50;
      } else if (rank <= 50) {
          return 25 - 0.1 * (rank - 4);
      } else if (rank <= 250) {
          return 10 - 0.01 * (rank - 51);
      } else {
          return 5 - 0.0001 * (rank - 251);
      }
    }

    // Adding score calculation
    Object.values(rankings).forEach(user => {
      user.score = Object.keys(user).reduce((score, key) => {
        if (key.includes('puzzle')) {
          const rank = parseInt(user[key]);
          score += calculateScore(rank);
        }
        if ((user.username == 'sushi2020.') && (key.includes('puzzle_1_rank'))) {
          score -= 100
        } else if ((user.username == 'reboot_2023') && (key.includes('puzzle_1_rank'))) {
          score -= 50
        } else if ((user.username == 'shibalily') && (key.includes('puzzle_1_rank'))) {
          score -= 25
        }
        return score;
      }, 0);
    });

    // Convert rankings object to array
    let rankingsArray = Object.values(rankings);

    // Sorting the array based on score
    rankingsArray.sort((a, b) => b.score - a.score);

    res.json(rankingsArray);
  } catch (error) {
    console.error("Failed to fetch rankings:", error);
    res.status(500).send("Failed to fetch rankings");
  }
});

async function createUser(discord_username) {
  console.log(`Creating user with name ${discord_username}`);

  try {
    const checkUserQuery = 'SELECT * FROM users WHERE discord_username = $1';
    const checkRes = await pool.query(checkUserQuery, [discord_username]);
    if (checkRes.rows.length > 0) {
      // User already exists
      return false;
    }

    const insertUserQuery = 'INSERT INTO users(discord_username) VALUES($1) RETURNING *';
    await pool.query(insertUserQuery, [discord_username]);
    // User was successfully created
    return true;
  } catch (error) {
    console.error("Failed to create the user:", error);
    throw error; // It's better to throw the error and handle it where the function is called
  }
}

/*****
 * User Methods
 **/

app.post('/api/users', async (req, res) => {
  const api_sent_in = req.query.apiKey;
  if (api_sent_in != API_KEY) {
    res.status(500).send("Failed to retrieve users.");
    return
  }

  const { discord_username } = req.body;
  if (!discord_username) {
    return res.status(400).send("Discord username is required");
  }

  try {
    already_exist = createUser(discord_username)
    if (already_exist) {
      return res.status(409).send("User already exists");
    } else {
      res.status(201).json(insertRes.rows[0]);
    }
  } catch (error) {
    res.status(500).send("Failed to create the user");
  }

});

app.get('/api/users', async (req, res) => {
  const api_sent_in = req.query.apiKey;
  if (api_sent_in != API_KEY) {
    res.status(500).send("Failed to retrieve users.");
    return
  }

  try {
    const getAllUsersQuery = 'SELECT * FROM users ORDER BY user_id';
    const usersRes = await pool.query(getAllUsersQuery);

    res.json(usersRes.rows);
  } catch (error) {
    res.status(500).send("Failed to retrieve users");
  }
});

app.get('/api/users/:userId', async (req, res) => {
  const { userId } = req.params;
  const api_sent_in = req.query.apiKey;
  if (api_sent_in != API_KEY) {
    res.status(500).send("Failed to retrieve users.");
    return
  }

  try {
    const getUserQuery = 'SELECT * FROM users WHERE user_id = $1';
    const userRes = await pool.query(getUserQuery, [userId]);

    if (userRes.rows.length === 0) {
      return res.status(404).send("User not found");
    }

    res.json(userRes.rows[0]);
  } catch (error) {
    res.status(500).send("Failed to retrieve the user");
  }
});

app.delete('/api/users/:userId', async (req, res) => {
  const { userId } = req.params;
  const api_sent_in = req.query.apiKey;
  if (api_sent_in != API_KEY) {
    res.status(500).send("Failed to retrieve users.");
    return
  }


  try {
    const deleteUserQuery = 'DELETE FROM users WHERE user_id = $1';
    await pool.query(deleteUserQuery, [userId]);
    res.status(204).send(); // No Content
  } catch (error) {
    res.status(500).send("Failed to delete the user");
  }
});

app.put('/api/users/:userId', async (req, res) => {
  const { userId } = req.params;
  const { discord_username } = req.body;
  const api_sent_in = req.query.apiKey;
  if (api_sent_in != API_KEY) {
    res.status(500).send("Failed to retrieve users.");
    return
  }


  try {
    const updateUserQuery = 'UPDATE users SET discord_username = $1 WHERE user_id = $2 RETURNING *';
    const updateRes = await pool.query(updateUserQuery, [discord_username, userId]);

    if (updateRes.rows.length === 0) {
      return res.status(404).send("User not found");
    }

    res.json(updateRes.rows[0]);
  } catch (error) {
    res.status(500).send("Failed to update the user");
  }
});

// Delete a submission
app.delete('/api/submission/:submissionId', async (req, res) => {
  const { submissionId } = req.params;
  const api_sent_in = req.query.apiKey;
  if (api_sent_in != API_KEY) {
    res.status(500).send("Failed to retrieve users.");
    return
  }


  try {
    const deleteUserQuery = 'DELETE FROM submissions WHERE leaderboard_id = $1';
    await pool.query(deleteUserQuery, [submissionId]);
    res.status(204).send(); // No Content
  } catch (error) {
    res.status(500).send("Failed to delete the submission");
  }
});


app.get('/api/auth/discord/callback', async (req, res) => {
  const code = req.query.code;
  const url_code = req.query.url || 'p';
  const puzzleNumber = req.query.puz;

  let final_uri = redirectUriDict[url_code]
  if (puzzleNumber) {
    console.log("using second url")
    final_uri = final_uri + "/puzzle" + puzzleNumber
  }
  console.log("Called callback with code", code)
  if (!code) {
    return res.status(400).json({ error: 'Missing code' });
  }

  try {
    // Exchange the code for an access token
    console.log(final_uri);
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: final_uri,
      }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    console.log("Token response", tokenResponse)

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.log("token data")
      console.log(tokenData)
      return res.status(400).json(tokenData);
    }

    const accessToken = tokenData.access_token;

    // Use the access token to fetch the user's details
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    const userData = await userResponse.json();
    let discord_username = userData['username']
    console.log("THe user data", userData)

    try {
      let already_exist = await createUser(discord_username)
      if (already_exist) {
        return res.json({
          'username': discord_username,
          'message': "User already exists."
        })
      } else {
        return res.json({
          'username': discord_username,
          'message': "User created."
        })
      }
    } catch (error) {
      res.status(500).send("Failed to create the user");
    }

  } catch (error) {
    console.error('Failed to fetch from Discord API:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Function adapted to accept a wallet address and return the token balance
async function getPoolBalance(client, walletAddress) {
  const contractAddress = "sei1fcnrr7053h9gdxz5nv80fj3ek3whv9xk9ka6p8r6azzaltlvspkqn6rynm";
  if (!client) {
    throw new Error('CosmWasm client is not initialized');
  }

  const balance = await client.queryContractSmart(contractAddress, {
    balance: {
      address: walletAddress
    }
  });

  return Number(balance.balance);
}


app.listen(3000, function() {
    console.log("App started")
});

// Export the app object. When executing the application local this does nothing. However,
// to port it to AWS Lambda we will create a wrapper around that will load the app from
// this file
module.exports = app
