import { asyncHandler } from "../utils/asyncHandler.js"
import {ApiError} from "../utils/ApiError.js"
import {User} from "../models/usermodel.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import jwt from "jsonwebtoken" 


const registerUser = asyncHandler (async (req,res)=>{ 
    const {fullname,email,username,password} = req.body
    if(
        [fullname,email,username,password].some((field)=>
        field?.trim()==="")
    ){
        throw new ApiError(400,"All field are compulsory.")
    }

    const existedUser = await User.findOne({
        $or:[{username},{email}]
    })

    if(existedUser){
        throw new ApiError(409,"User with email and username already exits")
    }

    const avatarlocalPath = req.files?.avatar[0]?.path
    // const coverImagelocalPath = req.files?.coverimage[0]?.path

    let coverImagelocalPath;
    if(req.files && Array.isArray(req.files.coverimage) && req.files.coverimage.length>0){
        coverImagelocalPath = req.files.coverimage[0].path
    }

    if(!avatarlocalPath){
        throw new ApiError(400,"Avatar file is required");
    }

    const avatar = await uploadOnCloudinary(avatarlocalPath)
    const coverimage = await uploadOnCloudinary(coverImagelocalPath)

    if(!avatar){
        throw new ApiError(400,"Avatar is required");
    }

    const user = await User.create({
        fullname,
        avatar:avatar.url,
        coverimage:coverimage?.url || "",
        email,
        password,
        username:username.toLowerCase()
    })

    const createdUser = await User.findById(user._id).select(
        "-password -refreshtoken"
    )

    if(!createdUser){
        throw new ApiError(500,"Something went wrong while registering user")
    }

    return res.status(201).json(
        new ApiResponse(200,createdUser,"User registered successfully")
    )

})


const generateAccessAndRefreshTokens = async(userId)=>{
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshtoken = refreshToken
        await user.save({validateBeforeSave:false})

        return {accessToken,refreshToken}
    } catch (error) {
        throw new ApiError(500,"Something went wrong while generating access and refresh token")
    }
}

const loginUser = asyncHandler (async (req,res)=>{
    const {username,email,password} = req.body
    if(!(username || email)){
        throw new ApiError(400,"username or email is required")
    }

    const user = await User.findOne({
        $or:[{username},{email}]
    })

    if(!user){
        throw new ApiError(404,"User doesnot exits.")
    }

    const isPasswordValid = await user.isPasswordCorrect(password)

    if(!isPasswordValid){
        throw new ApiError(401,"Invalid credential")
    }

    const {accessToken,refreshToken} = await generateAccessAndRefreshTokens(user._id)

    const loggedInUser = await User.findById(user._id).select("-password -refreshtoken")

    const options = {
        httpOnly: true,
        secure: true,
    }

    return res.status(200).cookie("accessToken",
        accessToken,options
    ).cookie("refreshToken",
        refreshToken,options
    ).json(
        new ApiResponse(
            200,
            {
                user:loggedInUser,accessToken,refreshToken
            },
            "User logged In successfully"
        )
    )



})

const logoutUser = asyncHandler (async (req,res)=>{
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set:{
                refreshtoken:undefined
            }
        },
        {
            new:true
        }
    )

    const options = {
        httpOnly: true,
        secure: true,
    }

    return res.status(200).clearCookie("accessToken",options).clearCookie("refreshToken",options).json(new ApiResponse(200,{},"User loggedout successfully"))

})

const refreshAccessToken = asyncHandler (async (req,res)=>{
    const incomingRefreshToken = req.cookies.refreshToken || req.body
    if(!incomingRefreshToken){
        throw new ApiError(401,"Unauthorized request")
    }

    try {
        const decodedToken = jwt.verify(incomingRefreshToken,process.env.REFRESH_TOKEN_SECRET)
    
        const user = await User.findById(decodedToken?._id)
        if(!user){
            throw new ApiError(401,"Invalid refresh Token")
        }
    
        if(incomingRefreshToken !== user?.refreshtoken){
            throw new ApiError(401,"refresh Token is expired or used")
        }
    
        const options = {
            httpOnly:true,
            secure:true
        }
    
        const {accessToken,newRefreshToken} = await generateAccessAndRefreshTokens(user._id)
    
        return res.status(200).cookie("accessToken",accessToken).cookie("refreshToken",newRefreshToken).json(
            new ApiResponse(
                200,{
                    accessToken,newRefreshToken
                },
                "Access token refreshed"
            )
        )
    } catch (error) {
        throw new ApiError(401,"Something went wrong or invalid refresh token")
    }
    
})


const changeCurrentPassword = asyncHandler (async (req,res)=>{
    const {oldPassword,newPassword} = req.body
    const user = await User.findById(req.user?._id)

    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

    if(!isPasswordCorrect){
        throw new ApiError(400,"Invalid password")
    }

    user.password = newPassword
    await user.save({validateBeforeSave:false})

    return res.status(200).json(
        new ApiResponse(
            200,{},"Password changed succesfully"
        )
    )
})

const getCurrentUser = asyncHandler(async (req,res)=>{
    return res.status(200).json(
        new ApiResponse(200,req.user,"current user fetched successfullu")
    )
})

const updateAccountDetails = asyncHandler(async(req,res)=>{
    const {fullname,email} = req.body
    if(!fullname || !email){
        throw new ApiError(400,"All field are required")
    }
    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                fullname,
                email: email
            }
        },
        {
            new:true
        }
    ).select("-password")
    return res.status(200).json(
        new ApiResponse(200,user,"account details succesfully")
    )
})

const updateUserAvatar = asyncHandler(async (req,res)=>{
    const avatarLocalPath = req.files?.path
    if(!avatarLocalPath){
        throw new ApiError(400,"Avatar file is missing")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)

    if(!avatar.url){
        throw new ApiError(400,"Error while uploading on avatar")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                avatar:avatar.url
            }
        },
        {new:true}
    ).select("-password")

    return res.status(200).json(
        new ApiResponse(
            200,user,"Avatar updated successfully"
        )
    )
})

const updateUserCoverImage = asyncHandler(async (req,res)=>{
    const coverImageLocalPath = req.files?.path
    if(!coverImageLocalPath){
        throw new ApiError(400,"CoverImage file is missing")
    }

    const coverimage = await uploadOnCloudinary(avatarLocalPath)

    if(!coverimage.url){
        throw new ApiError(400,"Error while uploading on coverimage")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                coverimage:coverimage.url
            }
        },
        {new:true}
    ).select("-password")

    return res.status(200).json(
        new ApiResponse(
            200,user,"CoverImage updated successfully"
        )
    )
})

export {registerUser,loginUser,logoutUser,refreshAccessToken,changeCurrentPassword,
    updateAccountDetails,updateUserAvatar,updateUserCoverImage
}