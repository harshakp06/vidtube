import dotenv from "dotenv"
import {app} from "./app.js"
import connectDB from "./db/index.js"

dotenv.config({
    path: "./.env"
})

const PORT = process.env.PORT || 7000

// app.listen(PORT, () => {
//     console.log(`Server is running on Port ${PORT}`);
    
// })


connectDB()
.then(() => {
    app.listen(PORT, () => {
        console.log(`Server is running on Port ${PORT}`);
        
    })
})
.catch((err) => {
    console.log("Mongodb connection error", err);
    
})