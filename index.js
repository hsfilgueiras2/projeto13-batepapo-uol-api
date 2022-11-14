import dayjs from "dayjs";
import joi from "joi";
import express from "express";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
dotenv.config();


const mongoClient = new MongoClient(process.env.MONGO_URI);
const app = express();
app.use(express.json());


try {
    console.log('conectando...');await mongoClient.connect();console.log("conectado")
} catch (err) {
    console.log(err)
}
const db = mongoClient.db("projeto_UOL");
const participants = db.collection("participants")
const msgs = db.collection("msgs")

setInterval(removeInactive, 15000)
//functions
async function removeInactive() {
    const currentTime = Date.now()
    const toRemove = await participants.find({ lastStatus: { $lt: currentTime - 10 } }).toArray()
    await participants.deleteMany({ lastStatus: { $lt: currentTime - 10 } })
    toRemove.forEach(async element => {
        await msgs.insertOne({ from: element.name, to: 'Todos', text: 'sai da sala...', type: 'status', time: dayjs().format("HH:mm:ss") })
    });

}

function returnMsgs(num, user) {
    const msgsToReturn = []
    msgs.find().toArray().then(mesgs => msgsToReturn = [...mesgs])
    msgsToReturn = msgsToReturn.filter(obj => {
        return obj.to == user || obj.from == user || obj.to == 'Todos';
    });
    if (num != null && num != undefined) {
        msgsToReturn.slice(-num)
    }
    return msgsToReturn;

}

// paths

app.get("/participants", async (req, res) => {
    try {
        const users = await participants.find().toArray()
        res.send(users)
            ;
    } catch (err) { res.sendStatus(500) }

});
app.post("/participants", async (req, res) => {
    const participantSchema = joi.object(
        {
            name: joi.string().required()
        }
    )
    if (participantSchema.validate(req.body).error) {
        const erros = participantSchema.validate(req.body).error.details.map((detail) => detail.message);
        res.status(422).send(erros);
        return;
    }
    const {name} = req.body
    try {
        if (await participants.findOne({ name: name })) {
            res.sendStatus(409)
            return
        }

        await participants.insertOne(
            { name: name, lastStatus: Date.now() }

        );
        await msgs.insertOne(
            { from: name, to: 'todos', text: 'entra na sala...', type: 'status', time: dayjs().format("HH:mm:ss") }
        );
        res.sendStatus(201)
    } catch (err) { console.log(err); res.sendStatus(500) }

});
app.get("/messages", async (req, res) => {
    const user = req.headers.user
    const limit = parseInt(req.query.limit);
    res.send(returnMsgs(limit, user))

});
app.post("/messages", async (req, res) => {
    const userArr = await participants.find().toArray()
    const fromARR = [];
    userArr.forEach(element => {
        fromARR.push(element.name)
    });
    const messageSchema = joi.object({
        to: joi.string().required(),
        text: joi.string().required(),
        type: joi.any().valid(['message','private_message']),
        from: joi.any().valid(...fromARR)
    })
    const { to, text, type } = req.body
    const user = req.headers.user
    if(messageSchema.validate({from: user, to: to, text: text, type: type},{abortEarly:false}))
    {
        res.sendStatus(422);
        return;
    }
    try {
        await msgs.insertOne(
            { from: user, to: to, text: text, type: type, time: dayjs().format("HH:mm:ss") }
        );
        res.sendStatus(201)
    } catch (err) { console.log(err); res.sendStatus(500) }

});

app.post("/status", async (req, res) => {
    const user = req.headers.user
    try {
        const name = await participants.findOne({ name: user })
        if (!name) {
            res.sendStatus(404)
            return;
        }
        await participants.updateOne({ name: user }, { $set: { lastStatus: Date.now() } })


        res.sendStatus(200)
    } catch (err) { res.sendStatus(500) }
})


app.listen(process.env.PORT, () => console.log(`server running on port ${process.env.PORT}`));