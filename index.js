const express = require('express');
const app= express();
const { MongoClient, ServerApiVersion } = require('mongodb');
const cors = require('cors');
require('dotenv').config()
const port =process.env.PORT || 5000;


//middleware
app.use(cors());
app.use(express.json());




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.fgqcw.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    //await client.connect();


    const guideCollection= client.db('TourismDB').collection('tourGuides')
    const packagesCollection=client.db('TourismDB').collection('tourPackages')
    const storiesCollection=client.db('TourismDB').collection('touristStories')
    
    app.get('/tour-guides', async (req,res)=>{
        const result= await guideCollection.find().toArray()
        res.send(result)
    })

    app.get('/packages', async (req,res)=>{
        const result= await packagesCollection.find().toArray()
        res.send(result)
    })


    app.get('/random-packages', async (req, res) => {
        const result = await packagesCollection.aggregate([{ $sample: { size: 3 } }]).toArray();
        res.send(result);
    });

    app.get('/random-guides', async (req, res) => {
        const result = await guideCollection.aggregate([{ $sample: { size: 6 } }]).toArray();
        res.send(result);
    });

    app.get('/stories/random', async (req, res) => {
        const result = await storiesCollection.aggregate([{ $sample: { size: 4 } }]).toArray();
        res.send(result);
    });
    
    app.get('/stories', async (req, res) => {
        const result = await storiesCollection.find().toArray();
        res.send(result);
    });



    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    //await client.close();
  }
}
run().catch(console.dir);




app.get('/', (req,res)=>{
    res.send('tourism management is running');
})
app.listen(port,()=>{
    console.log(`Tourism management is running on port ${port}`);
})