import fetch from "node-fetch";

import { esiRequestParams } from "./requestParams.js";

const baseApiUrl = "https://esi.evetech.net/latest";
async function getItemInfo(itemId) {
  const url = `${baseApiUrl}/universe/types/${itemId}`;
  console.log(`Getting info about ${itemId}`);
  const start = Date.now();
  const jsonFeed = await fetch(url, esiRequestParams)
    .then((bulk) => bulk.json())
    .catch((err) => {
      console.error(err, jsonFeed);
      jsonFeed = {};
    });

  const time = (Date.now() - start) / 1000;
  console.log(`Ready ${itemId} in ${time}`);
  return jsonFeed;
}

async function get() {
  const { jsonFeed } = await getItemInfo(process.argv[2]);
  process.send({ jsonFeed });
}
get();
