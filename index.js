const express = require('express');
const cors = require('cors');
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();

// middleware 
app.use(cors(
  {
    origin: [
        "https://room-story.netlify.app",
        // "http://localhost:5173"
    ]
  }
));
app.use(express.json());



// const uri = `mongodb+srv://${process.env.DB_USER_NAME}:${process.env.DB_USER_PASS}@cluster0.gbdj4eh.mongodb.net/?retryWrites=true&w=majority`;
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.SECRET_PASS}@cluster0.gbdj4eh.mongodb.net/?retryWrites=true&w=majority`;


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
        // await client.connect();

        const roomStoryDB = client.db("roomStoryDB");
        const user = roomStoryDB.collection("user");
        const payment = roomStoryDB.collection("payment");
        const works = roomStoryDB.collection("work");

        // custom middleware 
        const verifyToken = (req, res, next) => {
            const tokenString = req.headers.authorization;
            console.log("token inside verify token :", tokenString);
            if (!tokenString) {
                return res.status(401).send({ message: "no token" });
            }
            const token = tokenString.split(" ")[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: "Invaild token" });
                }
                console.log("decoded", decoded);
                req.decoded = decoded;
                next();
            });

        };

        const verifyHr = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email, role: "hr" };
            const result = await user.findOne(query);
            if (!result) {
                return res.status(403).send({ message: "not hr" });
            }
            next();
        };

        const verifyEmployee = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email, role: "employee" };
            const result = await user.findOne(query);
            if (!result) {
                return res.status(403).send({ message: "not employee" });
            }
            next();
        };
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email, role: "admin" };
            const result = await user.findOne(query);
            if (!result) {
                return res.status(403).send({ message: "not admin" });
            }
            next();
        };




        // jwt related api 
        app.post("/jwt", async(req, res) => {
            const userInfo = req.body;
            const {email} = userInfo;
            const query = {email: email};
            const result = await user.findOne(query);
            // if user is fired return his/him without token 
            // console.log("is fired:" ,result.isFired);
            if((result && result.isFired)){
                return res.status(403).send({message: "fired user"});
            }
            console.log("token request user info", userInfo);
            const token = jwt.sign(userInfo, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: "1h",
            });
            res.send({ token });
        });


        // user related api 

        // api for create user entry in db, any user can call it 
        app.post("/users", async (req, res) => {
            const userInfo = req.body;
            const result = await user.insertOne(userInfo);
            res.send(result);
        });
        // api for get single employee data only hr call it
        // DONE make sucure
        app.get("/users/:id", verifyToken, verifyHr, async (req, res) => {
            const userId = req.params.id;
            const query = { _id: new ObjectId(userId) };
            const result = await user.findOne(query);
            res.send(result);

        });
        // api for get user role, any logged user can call it 
        app.get("/users/role/:email", verifyToken, async (req, res) => {
            const requestedUserEmail = req.params.email;
            console.log("role request by user :", requestedUserEmail);
            if (requestedUserEmail !== req.decoded.email) {
                return res.status(403).send({ message: "invalil token owner" })
            }
            const query = { email: requestedUserEmail };
            const result = await user.findOne(query);
            // console.log(result.role);
            res.send({ role: result.role });

        });
        // api for get employee, only hr can call it 
        app.get("/employee-list", verifyToken, verifyHr, async (req, res) => {
            const query = { role: "employee" };
            const cursor = await user.find(query).toArray();
            res.send(cursor);

        });
        // api for get all employee including hr only admin can call this.
        // DONE  make secure 
        app.get("/all-employee-list", verifyToken, verifyAdmin, async (req, res) => {
            const query = {
                isVerified: true,
                role: { $in: ["employee", "hr"] }
            }
            const cursor = await user.find(query).toArray();
            res.send(cursor);

        });

        // api for update employee verify status, only hr can call it
        app.patch("/users/:id", verifyToken, verifyHr, async (req, res) => {
            const userId = req.params.id;
            const updatedStatus = req.body.isVerified;
            const filter = { _id: new ObjectId(userId) };
            const updateDoc = {
                $set: {
                    isVerified: updatedStatus
                }
            };
            const result = await user.updateOne(filter, updateDoc);
            res.send(result);

        });
        // api for fire emplyee/hr, only admin call call this 
        // DONE : make verified
        app.patch("/users/fired/:id", verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    isFired: true
                }
            };
            const result = await user.updateOne(filter, updatedDoc);
            res.send(result);
        });
        // api for make employee hr, only admin can call this
        // DONE make verified
        app.patch("/users/make-hr/:id", verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: "hr"
                }
            };
            const result = await user.updateOne(filter, updatedDoc);
            res.send(result);
        });


        // payments related api 

        // api for save employee payment, only hr can call it 
        // DONE make secure
        app.post("/payments", verifyToken, verifyHr, async (req, res) => {
            const paymentData = req.body;
            const result = await payment.insertOne(paymentData);
            res.send(result);
        });
        // api for get is already paid for the month, only hr can call it
        // TODO: make verified 
        app.post("/payments-status",verifyToken, verifyHr, async(req, res) => {
            const searchInfo = req.body;
            console.log(searchInfo);
            const query = {userEmail:searchInfo.email, paymentFor: searchInfo.paymentFor};
        
            const result = await payment.findOne(query);
            console.log(result);
            res.send (result);
        });
        // api for get single employee payment only hr can call it 
        // DONE make sucure
        app.get("/payments/:id", verifyToken, verifyHr, async (req, res) => {
            const userId = req.params.id;
            const query = { userId: userId };
            const result = await payment.find(query).toArray();
            res.send(result);

        });
        // api for get single employe payment only employee can call it 
        // DONE : make  sucure
        app.get("/payment-history/:email", verifyToken, verifyEmployee, async (req, res) => {
            const email = req.params.email;
            const query = { userEmail: email };
            const result = await payment.find(query).toArray();
            res.send(result);

        });


        // work sheet related api 

        // api for submit work sheet only employe can call it 
        // DONE: make verified
        app.post("/work-sheets", verifyToken, verifyEmployee, async (req, res) => {
            const submissonWork = req.body;
            const result = await works.insertOne(submissonWork);
            res.send(result);
        });
        // api for get all work sheet only hr can call it 
        // DONE make verified
        app.get("/work-sheets", verifyToken, verifyHr, async (req, res) => {
            const query = {};
            const cursor = await works.find(query).toArray();
            res.send(cursor);
        })
        // api for get single employee work sheet only emloyee can call it 
        // DONE  make verified
        app.get("/work-sheets/:email", verifyToken, verifyEmployee, async (req, res) => {
            const email = req.params.email;
            const query = { employeeEmail: email };
            const cursor = await works.find(query).toArray();
            res.send(cursor);
        });




        // payment intent 

        // for creating payment intent only hr can call it
        app.post("/create-payment-intent", verifyToken, verifyHr, async (req, res) => {
            const { salary } = req.body;
            const amount = parseInt(salary) * 100;
            console.log("amount inside payment intent :", amount);
            // Create a PaymentIntent with the order amount and currency
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                "payment_method_types": [
                    "card"
                ],
            });

            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

        // // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.get("/", (req, res) => {
    res.send("room story server is okay!");
});

app.listen(port, () => {
    console.log(`room story server running on port ${port}`);
});