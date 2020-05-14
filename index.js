require('dotenv').config();
const express = require("express");
const app = express();
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio')
const {MongoClient} = require('mongodb');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


const port = process.env.PORT || "8000";
const uri = process.env.URILINK

app.use(cors());

app.get("/", (req, res) => {
  res.status(200).send("The server is up and running.");
});

app.get("/data", async function(req, res) {

    const client = new MongoClient(uri)

    let todaydate = new Date()
    todaydate.setHours(todaydate.getHours()-4);
    let localdatestr = new Date(todaydate.toISOString().split("T")[0]).toISOString()

    try{
      await client.connect();
      
      //Check if today's date has already been looked up by scraping.
      let result = await client.db().collection("data").findOne({timestamp: localdatestr})
      if(result) {
        console.log("Latest satsifies!")
        res.status(200).send(await client.db().collection("data").find({}).toArray())
        return;
      }
      else console.log("Not found. Adding latest data.")

    } catch(e) {
      console.log(e)
    }

    //If not, then scrape the page. 
    const result = await axios.default.get("https://www.amherstma.gov/3519/Coronavirus")
    const $ = cheerio.load(result.data)
    const frViewText = $('.fr-view').text();

    const dateLocatorString = "Confirmed COVID-19 Cases:"
    const sampleDate = "May 12, 2020, 8:00 a.m. "
    const index = frViewText.indexOf(dateLocatorString)
    let datestring = frViewText.substring(index - sampleDate.length, index)
    let date = new Date(datestring.split(",").slice(0, 2).join())
    date.setHours(date.getHours()-4)

    //Check if data on the page is fresh. 
    let notfresh = await client.db().collection("data").findOne({timestamp: date.toISOString()})
    if(notfresh)
    {
      console.log("Not fresh. Returning old data.")
      res.status(200).send(await client.db().collection("data").find({}).toArray())
      return;
    }

    //If the data is fresh, then craft the response and submit it.
    const response = {
      amherst:Number(extractNumber(frViewText, "Amherst Total Cases:")), 
      hampshire:Number(extractNumber(frViewText, "Hampshire County Cases")), 
      mass:Number(extractNumber(frViewText, "Massachusetts:")), 
      timestamp:date.toISOString()
    }
    
    try{
      await client.db().collection("data").insertOne(response);
      console.log("Added today's data.")
    }
    catch(e) {
      console.log(e)
    }

    res.status(200).send(await client.db().collection("data").find({}).toArray());
});

function extractNumber(frViewText, locationString)
{
    const index = frViewText.indexOf(locationString)
    let cases = frViewText.substring(locationString.length + index, locationString.length + index + 8)
    return cases.replace(/[^0-9]/g, "")
}

app.listen(port, async function() {
  console.log(`Listening to requests on http://localhost:${port}`);
});