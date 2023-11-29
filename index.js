const express = require('express');
const cors = require('cors');
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const jwt = require("jsonwebtoken");


const app = express();

// middleware 
app.use(cors());
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
        await client.connect();

        const roomStoryDB = client.db("roomStoryDB");
        const user = roomStoryDB.collection("user");

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
            if(!result){
                return res.status(403).send({message: "not hr"});
            }
            next();
        };




        // jwt related api 
        app.post("/jwt", (req, res) => {
            const userInfo = req.body;
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
        // api for update employee verify status, only hr can call it
        app.patch("/users/:id", verifyToken, verifyHr, async(req, res) => {
            const userId = req.params.id;
            const updatedStatus = req.body.isVerified;
            const filter = { _id: new ObjectId(userId)};
            const updateDoc = {
                $set: {
                    isVerified: updatedStatus
                }
            };
            const result = await user.updateOne(filter, updateDoc);
            res.send(result);

        });
















        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
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