import fs from "fs";
import converter from "json-2-csv";
import jsonFormat from "json-format";

export const writeJsonToFile = async (data, fileName) => {
  if (!!!data) {
    throw new Error("NO DATA");
  }

  const JSONformatterConfig = {
    type: "space",
    size: 2,
  };

  fs.writeFile(`./output/${JSON.stringify(fileName)}.json`, JSON.stringify(data), function (err) {
    if (err) {
      throw new Error(err);
    }
    console.log("The file was saved !");
  });
  //  fs.writeFile(
  //    `./output/${fileName}.json`,
  //    jsonFormat(data, JSONformatterConfig),
  //    function (err) {
  //      if (err) {
  //        throw new Error(err);
  //      }
  //      console.log("The file was saved !");
  //    }
  //  );
  //
  //  const csvConvertionCallback = (err, csv) => {
  //    if (err) {
  //      throw err;
  //    }
  //    fs.writeFile(`./output/${fileName}.csv`, csv, (err) => {
  //      if (err) {
  //        return console.log(err);
  //      }
  //      console.log("The csv was saved !");
  //    });
  //  };
  //  converter.json2csv(data, csvConvertionCallback);
};
