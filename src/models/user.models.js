import mongoose, {Schema} from "mongoose";

import bcrypt from "bcrypt";

const userSchema = new Schema(
    {
        username: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            index: true
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        fullname:{
            type: String,
            unique: true,
            trim: true,
            index: true
        },
        avatar: {
            type: String, //cloudinary URL
            required: true,
        },
        coverImage: {
            type: String, //cloudinary URL
        },
        watchHistroy: [
            {
                type: Schema.Types.ObjectId,
                ref: "Video",
            }
        ], 
        password: {
            type: String,
            required: [true, "password is required"]
        },
        refreshToken: {
            type: String
        }

    },
    { timeseries: true}
)


userSchema.pre("save", async function (next) {
    this.password = bcrypt.hash(this.password, 10)
    next()
})

export const User = mongoose.model("User", userSchema)