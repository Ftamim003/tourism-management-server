const express = require('express');
const app= express();
const jwt=require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors');
require('dotenv').config()
const stripe=require('stripe')(process.env.STRIPE_SECRET_KEY);
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
    const bookingsCollection=client.db('TourismDB').collection('bookingInfo')
    const userCollection=client.db('TourismDB').collection('users')
    const paymentCollection=client.db('TourismDB').collection('payment')
    


     //JWT 

     app.post('/jwt',async(req,res)=>{

      const user=req.body;
      const token= jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {expiresIn:'3h'})
      res.send({token});
  })


    //middleware
    const verifyToken=(req,res,next)=>{
        
      //console.log('inside verify token',req.headers.authorization);
      if(!req.headers.authorization){
          return res.status(401).send({message:'unauthorized access'})
      }

      const token=req.headers.authorization.split(' ')[1];
      jwt.verify(token,process.env.ACCESS_TOKEN_SECRET,(err,decoded)=>{

          if(err){
              return res.status(401).send({message:'unauthorized access'})
          }
          req.decoded=decoded;
          next();
      })
      
  }



  //Verify Admin
  const verifyAdmin=async(req,res,next)=>{

    const email=req.decoded.email;
    const query={email:email};
    const user= await userCollection.findOne(query);
    const isAdmin=user?.role==='admin';

    if(!isAdmin){
        return res.status(403).send({message:'forbidden access'})
    }
    next();
}


    //Users

    app.get('/users',verifyToken,verifyAdmin, async (req,res)=>{
      const result= await userCollection.find().toArray()
      res.send(result);
  })

  app.get('/users/admin/:email',verifyToken,async(req,res)=>{
    const email=req.params.email;

    if(email!==req.decoded.email){
        return res.status(403).send({message:'forbidden access'})
    }

    const query={email:email};
    const user=await userCollection.findOne(query);

    let admin=false;
    if(user){
        admin=user?.role==='admin'
    }
    res.send({admin})

})


    app.post('/users',async (req,res)=>{
      const user=req.body;
      const query={email:user.email}
      const existingUser= await userCollection.findOne(query);
      if(existingUser){
        return res.send({message: 'user already exist',insertedId:null})
      }
      const result= await userCollection.insertOne(user);
      res.send(result);

    })

    app.delete('/users/:id',verifyToken,verifyAdmin,async(req,res)=>{
      const id=req.params.id;
      const query={_id: new ObjectId(id)}
      const result= await userCollection.deleteOne(query)
      res.send(result);
  })

  app.patch('/users/admin/:id',verifyToken,verifyAdmin,async(req,res)=>{
    const id=req.params.id;
    const filter={_id: new ObjectId(id)}
    const updatedDoc={
        $set:{
            role:'admin'
        }
    }
    const result= await userCollection.updateOne(filter, updatedDoc)
    res.send(result)
})


  //tours

    app.get('/tour-guides', async (req,res)=>{
        const result= await guideCollection.find().toArray()
        res.send(result)
    })

    app.post('/packages', async (req,res)=>{
      const item=req.body;
      const result= await packagesCollection.insertOne(item);
      res.send(result);
    })

    app.get('/packages', async (req,res)=>{
        const result= await packagesCollection.find().toArray()
        res.send(result)
    })

    app.get("/packages/:id", async (req, res) => {
      const id  = req.params.id;
      const query={ _id: new ObjectId(id) }
      const result = await packagesCollection.findOne(query);
      res.send(result);
    });

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

    app.get('/bookings',async(req,res)=>{
      const email=req.query.email;
      const query={email: email}
      const result=await bookingsCollection.find(query).toArray()
      res.send(result);
     });

    app.post('/bookings', async(req,res)=>{
      const info=req.body;
      const result= await bookingsCollection.insertOne(info)
      res.send(result)
    })


    //Update Booking
    app.patch('/bookings/:id', async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = { $set: { status } };
  
      const result = await bookingsCollection.updateOne(query, updateDoc);
      res.send(result);
  });

    app.delete('/bookings/:id',async (req,res)=>{
      const id=req.params.id;
      const query={_id: new ObjectId(id)}
      const result= await bookingsCollection.deleteOne(query);
      res.send(result)
    })


    //Payment Related
   app.post('/create-payment-intent',async(req,res)=>{
    const {price}=req.body;
    const amount=parseInt(price*100);

    const paymentIntent= await stripe.paymentIntents.create({
        amount:amount,
        currency:'usd',
        payment_method_types:['card']
    });

    res.send({
        clientSecret: paymentIntent.client_secret
    })

   })

   app.post('/payments',async(req,res)=>{
    const payment = req.body;
    const paymentResult= await paymentCollection.insertOne(payment);

    
     res.send({paymentResult});
   })


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