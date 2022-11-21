const express = require("express");
const app = express();
const cors = require("cors");
const { json } = require("express");
const { MongoClient, ServerApiVersion } = require("mongodb");
const port = process.env.PORT || 5000;
const jwt = require("jsonwebtoken");
const ObjectID = require("mongodb").ObjectId;
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET);
// username: doctorsportal
// password: Wkxyo1UZiYdAo7Yl
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("api is running");
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.bmqqztp.mongodb.net/?retryWrites=true&w=majority`;
// console.log(uri);

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send("unauthorized access");
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    const appointmentCollection = client
      .db("doctorsPortal")
      .collection("appointmentOptions");

    const bookingCollection = client.db("doctorsPortal").collection("bookings");
    const usersCollection = client.db("doctorsPortal").collection("users");
    const doctorssCollection = client.db("doctorsPortal").collection("doctors");

    const verifyAdmin = async (req, res, next) => {
      const decodedEmail = req.decoded.email;
      const query = {
        email: decodedEmail,
      };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    app.get("/appointmentOptions", async (req, res) => {
      const date = req.query.date;
      console.log(date);
      const query = {};
      const options = await appointmentCollection.find(query).toArray();
      const bookingQuery = {
        appointmentDate: date,
      };
      const alreadyBooked = await bookingCollection
        .find(bookingQuery)
        .toArray();
      options.forEach((option) => {
        const optionBooked = alreadyBooked.filter(
          (book) => book.treatment === option.name
        );
        const bookedSlots = optionBooked.map((book) => book.slot);
        const remainingSlots = option.slots.filter(
          (slot) => !bookedSlots.includes(slot)
        );
        option.slots = remainingSlots;
      });
      res.send(options);
    });

    app.get("/bookings", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = {
        email: email,
      };
      const bookings = await bookingCollection.find(query).toArray();
      res.send(bookings);
    });

    app.get("/bookings/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectID(id) };
      const booking = await bookingCollection.findOne(query);
      res.send(booking);
    });

    app.post("/bookings", async (req, res) => {
      const booking = req.body;
      const query = {
        appointmentDate: booking.appointmentDate,
        treatment: booking.treatment,
        email: booking.email,
      };
      const alreadyBooked = await bookingCollection.find(query).toArray();
      if (alreadyBooked.length) {
        const message = `You already have a booking on ${booking.appointmentDate}`;
        return res.send({ acknowledged: false, message });
      }
      const result = await bookingCollection.insertOne(booking);
      res.send(result);
    });

    app.post("/create-payment-intent", async (req, res) => {
      const booking = req.body;
      const price = booking.price;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        currency: "usd",
        amount: amount,
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.get("/jwt", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user) {
        const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, {
          expiresIn: "30d",
        });
        return res.send({ accessToken: token });
      }
      res.status(401).send({ accessToken: " " });
    });

    app.get("/appointmentSpecialty", async (req, res) => {
      const query = {};
      const result = await appointmentCollection
        .find(query)
        .project({ name: 1 })
        .toArray();
      res.send(result);
    });

    app.get("/users", async (req, res) => {
      const query = {};
      const users = await usersCollection.find(query).toArray();
      res.send(users);
    });

    app.get("/users/admin/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      res.send({ isAdmin: user?.role === "admin" });
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.put("/users/admin/:id", verifyJWT, verifyAdmin, async (req, res) => {
      //   const decodedEmail = req.decoded.email;
      //   const query = {
      //     email: decodedEmail,
      //   };
      //   const user = await usersCollection.findOne(query);
      //   if (user?.role !== "admin") {
      //     return res.status(403).send({ message: "forbidden access" });
      //   }
      const id = req.params.id;
      const filter = {
        _id: ObjectID(id),
      };
      const options = { upsert: true };
      const updatedDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await usersCollection.updateOne(
        filter,
        updatedDoc,
        options
      );
      res.send(result);
    });

    // temporary to update field on appointmentoptions

    // app.get("/addprice", async (req, res) => {
    //   const filter = {};
    //   const options = { upsert: true };
    //   const updatedDoc = {
    //     $set: {
    //       price: 99,
    //     },
    //   };
    //   const result = await appointmentCollection.updateMany(
    //     filter,
    //     updatedDoc,
    //     options
    //   );
    //   res.send(result);
    // });

    app.get("/doctors", verifyJWT, verifyAdmin, async (req, res) => {
      const query = {};
      const doctors = await doctorssCollection.find(query).toArray();
      res.send(doctors);
    });

    app.post("/doctors", verifyJWT, verifyAdmin, async (req, res) => {
      const doctor = req.body;
      const result = await doctorssCollection.insertOne(doctor);
      res.send(result);
    });
    app.delete("/doctors/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectID(id) };
      const result = await doctorssCollection.deleteOne(filter);
      res.send(result);
    });
  } finally {
  }
}
run().catch((error) => console.error(error));
app.listen(port, () => {
  console.log("server is running", port);
});
