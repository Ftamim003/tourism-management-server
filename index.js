const express = require("express");
const app = express();
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;

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
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    //await client.connect();
    const eventRegistrationCollection = client.db("TourismDB").collection("eventRegistrations");
    const guideCollection = client.db("TourismDB").collection("tourGuides");
    const packagesCollection = client
      .db("TourismDB")
      .collection("tourPackages");
    const storiesCollection = client
      .db("TourismDB")
      .collection("touristStories");
    const bookingsCollection = client.db("TourismDB").collection("bookingInfo");
    const userCollection = client.db("TourismDB").collection("users");
    const paymentCollection = client.db("TourismDB").collection("payment");
    const guideApplicationCollection = client.db("TourismDB").collection("guidesApplication");

    //JWT

    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "3h",
      });
      res.send({ token });
    });

    //middleware
    const verifyToken = (req, res, next) => {
      //console.log('inside verify token',req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }

      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    //Verify Admin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";

      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };


    

    //Users

    app.get('/assignedTours/:guideName', async (req, res) => {
      const { guideName } = req.params;
  
      try {
          const assignedTours = await bookingsCollection
              .find({ guideName, status: { $ne: "Cancelled" } }) // Exclude cancelled tours
              .toArray();
  
          res.send(assignedTours);
      } catch (error) {
          console.error("Error fetching assigned tours:", error);
          res.status(500).send({ error: "Failed to fetch assigned tours" });
      }
  });
  
  // Update booking status
  app.patch('/updateTourStatus/:id',verifyToken, async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;
  
      if (!ObjectId.isValid(id)) {
          return res.status(400).send({ error: "Invalid tour ID" });
      }
  
      try {
          const updatedResult = await bookingsCollection.updateOne(
              { _id: new ObjectId(id) },
              { $set: { status } }
          );
  
          if (updatedResult.modifiedCount === 0) {
              return res.status(404).send({ error: "Tour not found or status already updated" });
          }
  
          res.send({ message: "Tour status updated successfully" });
      } catch (error) {
          console.error("Error updating tour status:", error);
          res.status(500).send({ error: "Failed to update tour status" });
      }
  });

    app.get("/users", verifyToken,  async (req, res) => {
      const { search = "", role = "" } = req.query;

      try {
        const query = {};

        // Add search condition
        if (search) {
          query.$or = [
            { name: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
          ];
        }

        // Add role filter
        if (role) {
          query.role = role;
        }

        const users = await userCollection.find(query).toArray();
        res.send(users);
      } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).send({ message: "Failed to fetch users." });
      }
    });

    app.get("/admin/stats", verifyToken,verifyAdmin, async (req, res) => {
      try {
        const [
          totalPayment,
          totalTourGuides,
          totalPackages,
          totalClients,
          totalStories,
        ] = await Promise.all([
          // Sum all payment amounts in the bookingsCollection
          bookingsCollection
            .aggregate([{ $group: { _id: null, total: { $sum: "$price" } } }])
            .toArray(),
          // Count all tour guides in the tourGuides collection
          guideCollection.countDocuments(),
          // Count all packages in the tourPackages collection
          packagesCollection.countDocuments(),
          // Count all clients (users with the role 'tourist') in the users collection
          userCollection.countDocuments({ role: "user" }),
          // Count all stories in the touristStories collection
          storiesCollection.countDocuments(),
        ]);

        res.send({
          totalPayment: totalPayment[0]?.total || 0,
          totalTourGuides,
          totalPackages,
          totalClients,
          totalStories,
        });
      } catch (error) {
        console.error("Error fetching stats:", error);
        res.status(500).send({ error: "Failed to fetch stats" });
      }
    });

    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);

      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    app.get("/users/guide/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);

      let guide = false;
      if (user) {
        guide = user?.role === "guide";
      }
      res.send({ guide });
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exist", insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.delete("/users/:id", verifyToken,  async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    app.put("/update-profile/:email", async (req, res) => {
      const { email } = req.params;
      const { name, photo } = req.body;

      try {
        const result = await userCollection.updateOne(
          { email: email },
          { $set: { name: name, photoURL: photo } }
        );

        if (result.modifiedCount > 0) {
          res.send({ success: true, message: "Profile updated successfully." });
        } else {
          res.status(404).send({ success: false, message: "User not found." });
        }
      } catch (error) {
        console.error("Error updating profile:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to update profile." });
      }
    });

    app.patch(
      "/users/admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: "admin",
          },
        };
        const result = await userCollection.updateOne(filter, updatedDoc);
        res.send(result);
      }
    );

    app.patch("/users/role", async (req, res) => {
      const { email, role } = req.body;
      const filter = { email: email };
      const updatedDoc = {
        $set: { role: role },
      };

      try {
        const result = await userCollection.updateOne(filter, updatedDoc);
        res.send(result);
      } catch (error) {
        console.error("Error updating user role:", error);
        res.status(500).send({ message: "Failed to update user role." });
      }
    });

    //tours

    app.get("/tour-guides", async (req, res) => {
      const result = await guideCollection.find().toArray();
      res.send(result);
    });

    app.post("/tour-guides", async (req, res) => {
      const item = req.body;
      const result = await guideCollection.insertOne(item);
      res.send(result);
    });

    app.post("/packages", async (req, res) => {
      const item = req.body;
      const result = await packagesCollection.insertOne(item);
      res.send(result);
    });

    app.get("/packages", async (req, res) => {
      const result = await packagesCollection.find().toArray();
      res.send(result);
    });

    app.get("/packages/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await packagesCollection.findOne(query);
      res.send(result);
    });

    app.get("/random-packages", async (req, res) => {
      const result = await packagesCollection
        .aggregate([{ $sample: { size: 3 } }])
        .toArray();
      res.send(result);
    });

    app.get("/guideApplication", async (req, res) => {
      const applications = await guideApplicationCollection.find().toArray();
      res.send(applications);
    });

    app.post("/guideApplication", async (req, res) => {
      const item = req.body;
      const result = await guideApplicationCollection.insertOne(item);
      res.send(result);
    });

    app.delete("/guideApplication", async (req, res) => {
      const { email } = req.body; // Receive email from the request body
      const filter = { email: email }; // Use email to identify the application

      try {
        const result = await guideApplicationCollection.deleteOne(filter);
        res.send(result);
      } catch (error) {
        console.error("Error deleting application:", error);
        res.status(500).send({ message: "Failed to delete application." });
      }
    });

    app.get('/tourGuide/:id', async (req, res) => {
      const { id } = req.params;
  
      if (!ObjectId.isValid(id)) {
          return res.status(400).send({ error: "Invalid guide ID" });
      }
  
      try {
          const guide = await guideCollection.findOne({ _id: new ObjectId(id) });
  
          if (!guide) {
              return res.status(404).send({ error: "Tour guide not found" });
          }
  
          // Assuming stories are stored in a `storiesCollection`
          const stories = await storiesCollection.find({ guideId: id }).toArray();
  
          res.send({ guide, stories });
      } catch (error) {
          console.error("Error fetching tour guide details:", error);
          res.status(500).send({ error: "Failed to fetch tour guide details" });
      }
  

      
    });
    

    app.get("/random-guides", async (req, res) => {
      const result = await guideCollection
        .aggregate([{ $sample: { size: 6 } }])
        .toArray();
      res.send(result);
    });

    app.get("/stories/random", async (req, res) => {
      const result = await storiesCollection
        .aggregate([{ $sample: { size: 4 } }])
        .toArray();
      res.send(result);
    });

    app.get("/stories", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await storiesCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/stories/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await storiesCollection.findOne(query);
      res.send(result);
    });

    app.get("/allStories", async (req, res) => {
      const result = await storiesCollection.find().toArray();
      res.send(result);
    });

    app.post("/stories", async (req, res) => {
      const story = req.body;
      const result = await storiesCollection.insertOne(story);
      res.send(result);
    });

    // Update story details and add new images
    app.put("/stories/:id", async (req, res) => {
      const id = req.params.id;
      const { title, description, newImages } = req.body;

      try {
        const result = await storiesCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: { title, description },
            $push: { images: { $each: newImages } }, // Add new images
          }
        );
        res.send(result);
      } catch (error) {
        console.error("Error updating story:", error);
        res.status(500).send({ message: "Failed to update story" });
      }
    });

    // Remove specific image from story
    app.patch("/stories/:id/remove-image", async (req, res) => {
      const id = req.params.id;
      const { imageUrl } = req.body;

      try {
        const result = await storiesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $pull: { images: imageUrl } } // Remove image
        );
        res.send(result);
      } catch (error) {
        console.error("Error removing image:", error);
        res.status(500).send({ message: "Failed to remove image" });
      }
    });

    app.delete("/stories/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await storiesCollection.deleteOne(query);
      res.send(result);
    });

    app.get("/bookings", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await bookingsCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/bookings", async (req, res) => {
      const info = req.body;
      const result = await bookingsCollection.insertOne(info);
      res.send(result);
    });

    //Update Booking
    app.patch("/bookings/:id", async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = { $set: { status } };

      const result = await bookingsCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    app.delete("/bookings/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookingsCollection.deleteOne(query);
      res.send(result);
    });


    // Store Event Registration
    app.post('/event-registrations', async (req, res) => {
      try {
          const { name, email, contact } = req.body;
          if (!name || !email || !contact) {
              return res.status(400).json({ error: "All fields are required!" });
          }
          // Save the registration to the database (assuming MongoDB)
          const newRegistration = { name, email, contact };
          const result = await eventRegistrationCollection.insertOne(newRegistration);
          res.status(201).json(result);
      } catch (error) {
          res.status(500).json({ error: "Internal server error" });
      }
  });
  






    //Payment Related
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payments", async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);

      res.send({ paymentResult });
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    //await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("tourism management is running");
});
app.listen(port, () => {
  console.log(`Tourism management is running on port ${port}`);
});
