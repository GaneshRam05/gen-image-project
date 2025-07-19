import userModel from "../models/userModel.js";
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import razorpay from 'razorpay'
import transactionModel from "../models/transactionModel.js";

const registerUser=async(req, res)=>{
    try {
        const {name, email, password}=req.body;
        if(!name || !email || !password){
            return res.json({success: false, message: 'Missing Details'})
        }
        const salt = await bcrypt.genSalt(10)
        const hasedPassword=await bcrypt.hash(password, salt)

        const userData={
            name,email,password: hasedPassword
        }
        const newUser=new userModel(userData)
        const user=await newUser.save()

        const token=jwt.sign({id: user._id},process.env.JWT_SECRET)

        res.json({success: true, token, user: {name: user.name}})

    } catch (error) {
        console.log(error)
        res.json({success: false, message: error.message})
    }
}

const loginUser=async (req,res) => {
    try {
        const {email, password}=req.body;

        const user=await userModel.findOne({email: email.trim().toLowerCase()});

        if (!user) {
            return res.json({success:false, message: 'User does not exist'})
        }

        const isMatch=await bcrypt.compare(password, user.password)

        console.log("Password match:", isMatch);

        if (isMatch) {

            const token=jwt.sign({id: user._id},process.env.JWT_SECRET)
            res.json({success: true, token, user: {name: user.name}})

        } else {
            return res.json({success:false, message: 'Invalid Credentials'})
        }
    } catch (error) {
        //console.log(error)
        console.log("❌ Error in loginUser:", error.message);
        res.json({success: false, message: error.message})
    }
}

const userCredits = async (req, res) => {
    try {
        const {userId}=req.body
        const user=await userModel.findById(userId)
        res.json({success: true, credits: user.creditBalance, user:{name: user.name}})
    } catch (error) {
        console.log(error.message)
        res.json({success: false, message: error.message})
    }
}

const razorpayInstance = new razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
})

const paymentRazorpay = async (req, res) => {
    try {
        const { userId, planId } = req.body;

        if (!userId || !planId) {
            return res.json({ success: false, message: 'Missing Details' });
        }

        const userData = await userModel.findById(userId);

        if (!userData) {
            return res.json({ success: false, message: 'User not found' });
        }

        let credits, plan, amount;

        switch (planId) {
            case 'Basic':
                plan = 'Basic';
                credits = 100;
                amount = 10;
                break;

            case 'Advanced':
                plan = 'Advanced';
                credits = 500;
                amount = 50;
                break;

            case 'Business':
                plan = 'Business';
                credits = 5000;
                amount = 250;
                break;

            default:
                return res.json({ success: false, message: 'Invalid plan selected' });
        }

        const date = Date.now();

        const transactionData = {
            userId,
            plan,
            amount,
            credits,
            date,
        };

        // ✅ This is correct
        const newTransaction = await transactionModel.create(transactionData);

        // ✅ Razorpay Order Options
        const options = {
            amount: amount * 100,
            currency: process.env.CURRENCY,
            receipt: newTransaction._id.toString(),
        };

        // ✅ Don't mix await with callback!
        const order = await razorpayInstance.orders.create(options);

        return res.json({ success: true, order });

    } catch (error) {
        console.log("❌ Razorpay Error:", error.message);
        return res.json({ success: false, message: error.message });
    }
};

const verifyRazorpay = async (req, res) => {
    try {
        const { razorpay_order_id, receipt } = req.body;

        // ✅ Directly get transaction by ID (since you stored _id in `receipt`)
        const transactionData = await transactionModel.findById(receipt);
        if (!transactionData) {
            return res.json({ success: false, message: 'Transaction not found' });
        }

        if (transactionData.payment) {
            return res.json({ success: false, message: 'Payment already completed' });
        }

        const userData = await userModel.findById(transactionData.userId);
        const creditBalance = (userData.creditBalance || 0) + transactionData.credits;

        await userModel.findByIdAndUpdate(userData._id, { creditBalance });
        await transactionModel.findByIdAndUpdate(transactionData._id, { payment: true });

        return res.json({ success: true, message: 'Credits Added' });

    } catch (error) {
        console.log("❌ Razorpay Verify Error:", error.message);
        return res.json({ success: false, message: error.message });
    }
}

export {registerUser, loginUser, userCredits, paymentRazorpay, verifyRazorpay}