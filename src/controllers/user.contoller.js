import {asyncHandler} from "../utils/asyncHandler.js"
import {ApiError} from "../utils/ApiError.js"
import { User } from "../models/user.models.js"
import {uploadOnCloudinary, deleteFromCloudinary} from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import jwt from "jsonwebtoken"

const generateAccessAndRefreshToken = async (userId) => {
    try {
        const user = await User.findById(userId)
    
        // if user is not registered
        if (!user) {
            throw new ApiError(400,"User didn't found - Create new Account")
        }
    
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()
    
        user.refreshToken = refreshToken
        await user.save({validateBeforeSave: false})
        return {accessToken, refreshToken}
    } catch (error) {
            throw new ApiError(
              500,
              "Something went wrong while generating access and refresh tokens"
            );
        
    }



}




const registerUser = asyncHandler( async (req, res) => {
    const { fullname, username, email, password } = req.body;

    // validation
    if (
        [fullname,username,email,password].some((field) => field?.trim() === "")
    ){
        throw new ApiError(400,"All fields are required")
    }

    const existedUser = await User.findOne({
        $or: [{username},{email}]
    })

    if (existedUser) {
        throw new ApiError(409, "User with username or email already exists");

    }

    console.warn(req.files);
    
    const avatarLocalPath = req.files?.avatar?.[0]?.path
    const coverLocalPath = req.files?.coverImage?.[0]?.path

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is missing")
    }

    // const avatar = await uploadOnCloudinary(avatarLocalPath)
    // let coverImage = ""
    // if (coverLocalPath) {
    //     coverImage = await uploadOnCloudinary(coverImage)
    // }


    let avatar;
    try {
        avatar = await uploadOnCloudinary(avatarLocalPath)
        console.log("Uploaded avatar",avatar);
        
    } catch (error) {
        console.log("Error uploading avatar",error);
        throw new ApiError(500, "Failed to upload avatar")
        
    }


    let coverImage;
    try {
        coverImage = await uploadOnCloudinary(coverLocalPath);
        console.log("Uploaded Cover Image", coverImage);
        
    } catch (error) {
        console.log("Error uploading cover Image", error);
        throw new ApiError(500, "Failed to upload Cover Image")
        
    }


try {
        const user = await User.create({
            fullname,
            avatar: avatar.url,
            coverImage: coverImage?.url || "",
            email,
            password,
            username: username.toLowerCase()
        })
    
        const createdUser = await User.findById(user._id).select(
            "-password -refreshToken "
        )
    
        if (!createdUser){
            throw new ApiError(500, "Something went wrong while registering a User")
        }
    
        return res
        .status(201)
        .json(new ApiResponse(200, createdUser, "User registered Successfully"))
    
} catch (error) {
    console.log("User Creation Failed");

    if (avatar) {
        await deleteFromCloudinary(avatar.public_id)
    }

    if (coverImage) {
        await deleteFromCloudinary(coverImage.public_id)
    }

    throw new ApiError(500,"Something went wrong while registering a User and imsges were deleted");

    
}
})




const loginUser = asyncHandler(async (req,res) => {
    // get data from body

    const {email, username, password} = req.body

    // validation
    if (!email) {
        throw new ApiError(400, "Email is required")
    }

    const user = await User.findOne({
      $or: [{ username }, { email }],
    });

    if(!user) {
        throw new ApiError(404, "User not found")
    }


    // validate password

    const isPasswordValid = await user.isPasswordCorrect(password)

    if (!isPasswordValid) {
        throw new ApiError(401,"Invalid Credentials")
    }

    const {accessToken, refreshToken} = await generateAccessAndRefreshToken(user._id)


    const loggedInUser = await User.findById(user._id)
            .select("-password -refreshToken")

    if(!loggedInUser){
        throw new ApiError(404,"User not able to login")
    }

    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
    }

    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(new ApiResponse(
            200, 
            {user: loggedInUser, accessToken, refreshToken}, 
            "User logged in Successfully"
        ))
    })


const logoutUser = asyncHandler( async (req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refreshToken: undefined,
            }
        },
        {new: true}
    )

    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
    }

    return res
        .status(200)
        .clearCookie("accessToken",options)
        .clearCookie("refreshToken",options)
        .json(new ApiResponse(200,{},"User Logged out Successfully"))
})



const refreshAccessToken = asyncHandler(async (req,res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if (!incomingRefreshToken) {
        throw new ApiError(401, "Refresh token is required")
    }

    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        )

        const user = await User.findById(decodedToken?._id)

        if (!user) {
            throw new ApiError(401, "Invalid refresh token")
        }

        if (incomingRefreshToken !== user?.refreshToken) {
            throw new ApiError(401, "Invalid refresh token")
            
        }

        const options = {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
        };

        const {accessToken, refreshToken: newRefreshToken} = await generateAccessAndRefreshToken(user._id)


        return res
            .status(200)
            .cookie("accessToken",accessToken,options)
            .cookie("refreshToken",refreshToken,options)
            .json(
                new ApiResponse(
                    200,
                    {accessToken,
                        refreshToken:newRefreshToken
                    },
                    "Access token refreshed successfully"
                ));
    } catch (error) {
        throw new ApiError(
            500,
            "Something went wrong while refreshing access token")
    }
})


const changeCurrentPassword = asyncHandler(async(req,res) => {
    const {oldPassword, newPassword} = req.body

    const user = await User.findById(req.user?._id)

    const isPasswordValid = await user.isPasswordCorrect(oldPassword)

    if(!isPasswordValid) {
        throw new ApiError(401,"Old password is incorrect")
    }

    user.password = newPassword

    await user.save({validateBeforeSave: false})

    return res.status(200).json( new ApiResponse(200, {}, "Password chnaged successfully"))

})


const getCurrentUser = asyncHandler(async(req,res) => {
    return res.status(200).json( new ApiResponse(200, req.user, "Current user details"))
})


const updateAccountDetails = asyncHandler(async(req,res) => {
    const {fullname, email} = req.body

    if(!fullname || !email) {
        throw new ApiError(400, "Fullname and email are required")
    }

    User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullname,
                email: email
            }
        },
        {new: true}
    ).select("-password -refreshToken")

    return res.status(200).json(new ApiResponse(200, user,"Account details updated successfully"))
})


const updateUserAvatar = asyncHandler(async(req,res) => {

    const avatarLocalPath = req.files?.path;

    if (!avatarLocalPath) {
        throw new ApiError(400, "File is required")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)

    if(!avatar.url){
        throw new ApiError(500, "Something went wrong while uploading avatar")
    }

    await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                avatar:avatar.url
            }
        },
        {new: true}
    ).select("-password -refreshToken")

    res.status(200).json( new ApiResponse(200, user, "Avatar updated Successfully"))

})


const updateUserCoverImage = asyncHandler(async(req,res) => {

    const coverImageLocalPath = req.file?.path

    if(!coverImageLocalPath){
        throw new ApiError(400, "File is required")
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if(!coverImage.url){
        throw new ApiError(500, "Something went wrong while uploading cover image")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                coverImage: coverImage.url
            }
        },
        {new: true}
    ).select("-password -refreshToken")

    return res.status(200).json( new ApiResponse(200, user, "Cover Image updated Successfully"))
})



export {
    registerUser,
    loginUser,
    refreshAccessToken,
    logoutUser,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage
}