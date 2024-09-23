// require('dotenv').config({path:'./env'})
import dotenv from "dotenv"
import connectDB from "./db/db.js";
import {app} from "../src/app.js"


dotenv.config({path:'./env'})
connectDB()
.then(
    app.listen(process.env.PORT || 8000,()=>{
        console.log(`Server is running at ${process.env.PORT}`)
    })
)
.catch((error)=>{
    console.log("MONGODB error",error);
    process.exit(1);
});