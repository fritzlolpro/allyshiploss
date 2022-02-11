import fetch from "node-fetch";

import { esiRequestParams } from "./requestParams.js";

const baseApiUrl = "https://esi.evetech.net/latest";
async function getItemInfo(itemId, itemEtag) {
  const url = `${baseApiUrl}/universe/types/${itemId}`;
  console.log(`Getting info about ${itemId}`);
  const start = Date.now();
  esiRequestParams.headers = {
    path: `/latest/universe/types/${itemId}/?datasource=tranquility`,
    "If-None-Match": itemEtag,
    ...esiRequestParams.headers,
  };
  const result = await fetch(url, esiRequestParams);

  const { etag } = result.headers;
  const jsonFeed = await result.json().catch((err) => {
    console.error(err, jsonFeed);
    jsonFeed = {};
  });
  const time = (Date.now() - start) / 1000;
  console.log(`Ready ${itemId} in ${time}`);
  return { jsonFeed, etag};
}

async function get() {
  const { jsonFeed, etag} = await getItemInfo(process.argv[2], process.argv[3]);
  process.send({ jsonFeed, etag });
}
get();
