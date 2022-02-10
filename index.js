import fetch from "node-fetch";
import { fork } from "child_process";
import { writeJsonToFile } from "./fileWriter.js";
import { EventEmitter } from "events";
import { zkbRequestParams, esiRequestParams } from "./requestParams.js";
const baseApiUrl = "https://esi.evetech.net/latest";
const killboardUrl = "https://zkillboard.com";
const gsfId = "1354830081";
//const pageLimit = Infinity;
const pageLimit = 1;
EventEmitter.defaultMaxListeners = 1500;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function isIterable(obj) {
  if (obj == null) {
    return false;
  }
  return typeof obj[Symbol.iterator] === "function";
}

async function getAllyLoses(allyId) {
  let jsonFeed = [];
  let page = 1;

  const fetchPerPage = async (pageNumber) => {
    await delay(1500 * (Math.random() + 1));
    let data = {};
    try {
      const url = `${killboardUrl}/api/losses/allianceID/${allyId}/pastSeconds/604800/page/${pageNumber}/`;
      //const start = Date.now();
      console.log("fetching page" + pageNumber, url);
      const result = await fetch(url, zkbRequestParams);
      //const time = (Date.now() - start) / 1000;
      //console.log(`Result for page ${pageNumber} in ${time}`);
      data = await result.json().catch((error) => {
        console.log(result);
        data = {};
      });
    } catch (error) {
      console.error(error);
    }
    return data;
  };

  const refetch = async () => {
    const result = await fetchPerPage(page);
    if (result.length > 0) {
      jsonFeed = [...jsonFeed, ...result];
      page += 1;
      if (page <= pageLimit) {
        console.log(page);
        await refetch();
      }
    }
  };
  await refetch();
  return jsonFeed;
}

async function getKillmail(killId, killHash, killEtag) {
  const getKm = fork("./getKillmail.js", [killId, killHash, killEtag]);
  const result = await new Promise((resolve, reject) => {
    getKm.on("message", ({ jsonFeed, etag }) => {
      resolve({ jsonFeed, etag });
    });
  });
  return result;
}

function calculateItemsQuantity(items) {
  const result = {};
  items.forEach((element) => {
    if (result[element]) {
      result[element] += 1;
    } else {
      result[element] = 1;
    }
  });
  return result;
}

function sortQuantityData(obj) {
  const sortedResult = Object.keys(obj)
    .map((key) => {
      return { key, losses: obj[key] };
    })
    .sort((fi, se) => se.losses - fi.losses);
  return sortedResult;
}

async function getGoonLoses() {
  const loses = await getAllyLoses(gsfId);
  const killmailIds = loses.map((loss) => {
    return { id: loss.killmail_id, hash: loss.zkb.hash };
  });
  console.log(`Will get ${killmailIds.length} killmails`);
  let killEtag = null;

  const killList = await Promise.all(
    killmailIds.map(async (killmail, i) => {
      const { jsonFeed, etag } = await getKillmail(
        killmail.id,
        killmail.hash,
        killEtag
      );
      if (killEtag !== etag) {
        killEtag = etag;
      }
      console.log(`Got killmail ${i} of ${killmailIds.length}`);
      return jsonFeed;
    })
  );

  const shipList = killList.map((kill) => kill?.victim?.ship_type_id);
  const modulesList = killList.map((kill) => kill?.victim?.items);
  return { shipList, modulesList };
}

async function getItemInfo(itemId) {
  const getII = fork("./getItemInfo.js", [itemId]);
  const result = await new Promise((resolve, reject) => {
    getII.on("message", ({ jsonFeed }) => {
      resolve({ jsonFeed });
    });
  });
  return result;
}

async function applyNames(items) {
  console.log(`Apply names to ${items.length} items`);
  const itemsWithNames = await Promise.all(
    items.map(async (item) => {
      const itemData = await getItemInfo(item.key);
      const name = itemData.name;
      return {
        ...item,
        name,
      };
    })
  );
  return itemsWithNames;
}

async function groupModulesByType(modulesList) {
  const unicModules = {};
  if (!isIterable(modulesList)) return {};
  for (const moduleBatch of modulesList) {
    if (!isIterable(moduleBatch)) return {};
    for (const module of moduleBatch) {
      const modulesDropped = module.quantity_dropped
        ? module.quantity_dropped
        : 0;

      const modulesDestroyed = module.quantity_destroyed
        ? module.quantity_destroyed
        : 0;

      const { item_type_id } = module;

      let name = unicModules[item_type_id]?.name;

      if (!name) {
        const itemData = await getItemInfo(item_type_id);
        name = itemData?.name;
      }

      unicModules[item_type_id] = {
        item_type_id,
        name,
        quantity_destroyed: unicModules[item_type_id]
          ? unicModules[item_type_id].quantity_destroyed + modulesDestroyed
          : modulesDestroyed,
        quantity_dropped: unicModules[item_type_id]
          ? unicModules[item_type_id].quantity_dropped + modulesDropped
          : modulesDropped,
        positions: unicModules[item_type_id]?.positions
          ? [...unicModules[item_type_id].positions, module.flag]
          : [module.flag],
      };
    }
  }

  const sortedResult = Object.keys(unicModules)
    .map((key) => {
      return { ...unicModules[key] };
    })
    .sort((fi, se) => se.quantity_destroyed - fi.quantity_destroyed);
  return sortedResult;
}

async function main() {
  console.log(new Date().toLocaleString());
  const { shipList, modulesList } = await getGoonLoses();
  const lossesQuantity = calculateItemsQuantity(shipList);
  const sortedLosses = sortQuantityData(lossesQuantity);
  const namedLosses = await applyNames(sortedLosses);

  const modulesLosses = await groupModulesByType(modulesList);
  writeJsonToFile(namedLosses, `Ship losses ${Date.now()}`);
  writeJsonToFile(modulesLosses, `Module losses ${Date.now()}`);
}
main();
