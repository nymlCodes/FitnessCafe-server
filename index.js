
require('dotenv').config();
const cors = require('cors')

const express = require('express');
const { createRemoteJWKSet, jwtVerify } = require('jose-cjs');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express()
const uri = process.env.MONGO_URI;
const PORT = process.env.PORT || 5000

app.use(cors())
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Server is running');
});

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

const JWKS = createRemoteJWKSet(new URL(`${process.env.NEXT_PUBLIC_FRONTEND_URL}api/auth/jwks`)) // Note: Fixed URL slash

const verifyToken = async (req, res, next) => {
    const authHeader = req?.headers.authorization

    // 1. Fail early if header is missing OR doesn't start with "Bearer "
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Unauthorized: Missing or malformed token format' })
    }

    // 2. Safely slice out the token after the "Bearer " prefix (7 characters)
    const token = authHeader.substring(7).trim()

    if (!token) {
        return res.status(401).json({ message: 'Unauthorized: Token payload is empty' })
    }


    // console.log("TOKEN RECEIVED:", token)
    // console.log("JWKS URL:", `${process.env.CLIENT_URL}/api/auth/jwks`)

    try {
        const { payload } = await jwtVerify(token, JWKS)

        // 3. Attach the payload to the request object so your router endpoints can access user info
        req.user = payload
        console.log(payload);
        

        next()
    }
    catch (error) {
        console.error("JWT Verification failed:", error.message)
        return res.status(403).json({ message: 'Forbidden' })
    }
}

async function run() {
    try {
        //         await client.connect();
        //         await client.db("admin").command({ ping: 1 });
        //         console.log("Pinged your deployment. You successfully connected to MongoDB!");

        // collections
        const db = client.db('fitness-cafe');
        const classCollection = db.collection('classes');
        const forumCollection = db.collection('forums');
        const userCollection = db.collection('user'); // Singular 'user' collection
        const myBookedClasesCollection = db.collection('my-booked-classes');
        const favoritesCollection = db.collection('favorites');
        const applyForTrainerCollection = db.collection('apply-for-trainer')

        const isUserBlocked = async (userId) => {
            if (!userId) return false;
            try {
                const query = ObjectId.isValid(userId)
                    ? { $or: [{ _id: userId }, { _id: new ObjectId(userId) }] }
                    : { _id: userId };
                const user = await userCollection.findOne(query);
                return user?.status === 'blocked';
            } catch (error) {
                return false;
            }
        };

        // ==========================================
        // ALL APIS
        // ==========================================

        // --- CLASSES ---

        app.post('/all-classes', async (req, res) => {
            try {
                const classData = req.body;
                const result = await classCollection.insertOne(classData);
                res.status(201).json(result);
            } catch (error) {
                console.error("Insert error:", error);
                res.status(500).json({ error: "Failed to insert class" });
            }
        });


        app.get('/all-classes', async (req, res) => {


            try {
                const { search, category } = req.query;

                // Always start from approved classes only
                const query = { status: 'approved' };

                // ── Category filter ──
                if (category && category.toLowerCase() !== 'all') {
                    query.category = { $regex: new RegExp(`^${category}$`, 'i') };
                }

                // ── Text search across multiple fields ──
                if (search && search.trim()) {
                    const searchRegex = new RegExp(search.trim(), 'i');
                    query.$or = [
                        { name: searchRegex },
                        { title: searchRegex },
                        { instructor: searchRegex },
                        { description: searchRegex },
                    ];
                }

                const result = await classCollection.find(query).toArray();
                res.json(result);

            } catch (error) {
                console.error('Error fetching classes:', error);
                res.status(500).json({ message: 'Internal server error' });
            }
        });


        app.get('/all-classes-admin', async (req, res) => {
            const result = await classCollection.find().toArray();
            res.json(result);
        });

        app.get('/all-classes/:id', async (req, res) => {
            const { id } = req.params;
            const query = { _id: new ObjectId(id) };
            const result = await classCollection.find(query).toArray();
            res.json(result);
        });

        app.get('/admin-classes', async (req, res) => {
            const result = await classCollection.find().toArray();
            res.json(result);
        });

        app.patch('/admin-classes/:id', async (req, res) => {
            const { id } = req.params;
            const updatedData = req.body;
            const result = await classCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: updatedData }
            );
            res.json(result);
        });

        app.delete('/admin-classes/:id', async (req, res) => {
            const { id } = req.params;
            const result = await classCollection.deleteOne({
                _id: new ObjectId(id)
            });
            res.json(result);
        });

        app.get('/my-classes/:trainerId',verifyToken, async (req, res) => {
            const { trainerId } = req.params;
            const result = await classCollection
                .find({ trainerId })
                .toArray();
            res.json(result);
        });

        app.patch('/update-class/:id', async (req, res) => {
            const { id } = req.params;
            const updatedData = req.body;
            const result = await classCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: updatedData }
            );
            res.json(result);
        });

        app.delete('/delete-class/:id', async (req, res) => {
            const { id } = req.params;
            const result = await classCollection.deleteOne({
                _id: new ObjectId(id)
            });
            res.json(result);
        });

        // --- FORUM POSTS ---

        app.post('/forum-posts', async (req, res) => {
            const forum = req.body;
            const result = await forumCollection.insertOne(forum);
            res.json(result);
        });

        app.get('/forum-posts', async (req, res) => {
            const result = await forumCollection.find().toArray();
            res.json(result);
        });


        app.delete('/forum-posts/:id', verifyToken,async (req, res) => {
            const { id } = req.params
            const result = await forumCollection.deleteOne({
                _id: new ObjectId(id)
            })
            res.json(result)
        });

        app.get('/forum-posts/:id', async (req, res) => {
            const { id } = req.params
            const query = { _id: new ObjectId(id) };

            const result = await forumCollection.find(query).toArray()
            res.json(result);
        });

        app.get('/my-forum-posts/:userId', async (req, res) => {
            const { userId } = req.params;
            const result = await forumCollection.find({
                userId: userId
            }).toArray();
            res.json(result);
        });

        app.patch('/forum-posts/:id/toggle-like', async (req, res) => {
            try {
                const { id } = req.params;
                const { userId } = req.body;
                if (!userId) return res.status(400).json({ message: "User ID required" });

                const query = { _id: new ObjectId(id) };
                const post = await forumCollection.findOne(query);
                if (!post) return res.status(404).json({ message: "Post not found" });

                const currentLikes = post.likes || [];

                if (currentLikes.includes(userId)) {
                    await forumCollection.updateOne(query, { $pull: { likes: userId } });
                } else {
                    await forumCollection.updateOne(query, {
                        $addToSet: { likes: userId },
                        $pull: { dislikes: userId }
                    });
                }

                const updatedPost = await forumCollection.findOne(query);
                res.status(200).json({
                    updatedLikes: updatedPost.likes || [],
                    updatedDislikes: updatedPost.dislikes || []
                });
            } catch (error) {
                res.status(500).json({ message: "Error toggling like", error: error.message });
            }
        });

        app.patch('/forum-posts/:id/toggle-dislike', async (req, res) => {
            try {
                const { id } = req.params;
                const { userId } = req.body;
                if (!userId) return res.status(400).json({ message: "User ID required" });

                const query = { _id: new ObjectId(id) };
                const post = await forumCollection.findOne(query);
                if (!post) return res.status(404).json({ message: "Post not found" });

                const currentDislikes = post.dislikes || [];

                if (currentDislikes.includes(userId)) {
                    await forumCollection.updateOne(query, { $pull: { dislikes: userId } });
                } else {
                    await forumCollection.updateOne(query, {
                        $addToSet: { dislikes: userId },
                        $pull: { likes: userId }
                    });
                }

                const updatedPost = await forumCollection.findOne(query);
                res.status(200).json({
                    updatedLikes: updatedPost.likes || [],
                    updatedDislikes: updatedPost.dislikes || []
                });
            } catch (error) {
                res.status(500).json({ message: "Error toggling dislike", error: error.message });
            }
        });

        // --- USER MANAGEMENT ---

        app.get('/users', async (req, res) => {
            try {
                const result = await userCollection.find().toArray();
                res.json(result);
            } catch (error) {
                console.error("Error fetching users:", error);
                res.status(500).json({ error: "Failed to fetch users" });
            }
        });

        app.patch('/users/:id', async (req, res) => {
            try {
                const { id } = req.params;
                const { status, role } = req.body;

                const filter = { _id: new ObjectId(id) };

                const updateFields = {};
                if (status !== undefined) updateFields.status = status;
                if (role !== undefined) updateFields.role = role;

                const updatedDoc = { $set: updateFields };

                const result = await userCollection.updateOne(filter, updatedDoc);
                res.json(result);
            } catch (error) {
                console.error("Error updating user data:", error);
                res.status(500).json({ error: "Failed to update user data" });
            }
        });

        // --- BOOKED CLASSES ---

        app.post('/my-booked-classes', async (req, res) => {
            try {
                const myBookedClases = req.body;
                const { userId, classId, transactionId } = myBookedClases;

                const blocked = await isUserBlocked(userId);
                if (blocked) {
                    return res.status(403).json({ error: "Your account is suspended. Booking operations restricted." });
                }

                const exists = await myBookedClasesCollection.findOne({
                    $or: [
                        { classId, userId },
                        { transactionId: transactionId }
                    ]
                });

                if (exists) {
                    return res.status(400).json({ error: "You are already registered for this class or transaction processed." });
                }

                const result = await myBookedClasesCollection.insertOne(myBookedClases);
                res.json(result);
            } catch (error) {
                console.error("Booking insert error:", error);
                res.status(500).json({ error: "Failed to book class" });
            }
        });

        app.get('/booked-classes', async (req, res) => {
            try {
                const result = await myBookedClasesCollection.find().toArray();
                res.send(result);
            } catch (error) {
                res.status(500).send({ error: error.message });
            }
        });

        app.get('/bookings/check', async (req, res) => {
            try {
                const { classId, userEmail } = req.query;
                const found = await myBookedClasesCollection.findOne({ classId, userEmail });
                res.json({ booked: !!found });
            } catch (error) {
                res.status(500).json({ error: "Failed to check booking status" });
            }
        });

        app.get('/my-booked-classes/:userEmail',verifyToken, async (req, res) => {
            try {
                const { userEmail } = req.params;
                const result = await myBookedClasesCollection.find({ userEmail: userEmail }).toArray();
                res.json(result);
            } catch (error) {
                console.error("Fetch booked classes error:", error);
                res.status(500).json({ error: "Failed to fetch booked classes" });
            }
        });


        app.get('/admin-booked-classes', async (req, res) => {
            try {
                const result = await myBookedClasesCollection.find().toArray();
                res.json(result);
            } catch (error) {
                console.error("Fetch booked classes error:", error);
                res.status(500).json({ error: "Failed to fetch booked classes" });
            }
        });

        // --- FAVORITES ---

        app.post('/favorites', async (req, res) => {
            try {
                const favoriteDoc = req.body;
                const { classId, userId } = favoriteDoc;

                const blocked = await isUserBlocked(userId);
                if (blocked) {
                    return res.status(403).json({ error: "Your account is suspended. Actions restricted." });
                }

                const exists = await favoritesCollection.findOne({ classId, userId });
                if (exists) {
                    return res.status(400).json({ error: "Class already in favorites" });
                }

                const result = await favoritesCollection.insertOne(favoriteDoc);
                res.json({ success: true, result });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        app.get('/favourites/:userId', async (req, res) => {
            const { userId } = req.params
            const result = await favoritesCollection.find({ userId: userId }).toArray()
            res.json(result)
        })

        app.delete('/favorites', async (req, res) => {
            try {
                const { classId, userId } = req.body;
                const result = await favoritesCollection.deleteOne({ classId, userId });
                res.json({ success: true, deletedCount: result.deletedCount });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        app.get('/favorites/check', async (req, res) => {
            try {
                const { classId, userId } = req.query;
                const found = await favoritesCollection.findOne({ classId, userId });
                res.json({ favorited: !!found });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });


        app.post('/apply-as-trainer',verifyToken, async (req, res) => {
            const applyForTrainer = req.body
            const result = await applyForTrainerCollection.insertOne(applyForTrainer)
            res.json(result)
        })

        app.get('/apply-as-traienr', async (req, res) => {
            const result = await applyForTrainerCollection.find().toArray()
            res.json(result)
        })

        app.get('/apply-as-trainer/:email', async (req, res) => {
            const { email } = req.params
            const result = await applyForTrainerCollection.findOne({ userEmail: email })
            res.json(result)
        })

        app.patch('/approve-trainer/:id', async (req, res) => {
            try {
                const { id } = req.params;
                const { userEmail } = req.body;
                if (!userEmail) return res.status(400).json({ error: "User email context is required." });
                await userCollection.updateOne({ email: userEmail }, { $set: { role: 'trainer' } });
                await applyForTrainerCollection.deleteOne({ _id: new ObjectId(id) });
                res.status(200).json({ success: true });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });









        const { ObjectId } = require('mongodb');

        app.post('/forum-posts/:id/comment', async (req, res) => {
            try {
                const { id } = req.params;
                const { userId, userName, text } = req.body;

                if (!userId || !text.trim()) {
                    return res.status(400).json({ message: "Invalid comment data payload." });
                }

                const newComment = {
                    _id: new ObjectId(),
                    userId,
                    userName,
                    text,
                    createdAt: new Date()
                };

                const query = { _id: new ObjectId(id) };
                await forumCollection.updateOne(query, { $push: { comments: newComment } });

                const updatedPost = await forumCollection.findOne(query);
                res.status(200).json({ updatedComments: updatedPost.comments || [] });
            } catch (error) {
                res.status(500).json({ message: "Server error processing comment pipeline.", error: error.message });
            }
        });



        app.post('/forum-posts/:postId/comment/:commentId/reply', async (req, res) => {
            try {
                const { postId, commentId } = req.params;
                const { userId, userName, text } = req.body;

                if (!userId || !text.trim()) {
                    return res.status(400).json({ message: "Invalid payload logic data." });
                }

                const newReply = {
                    _id: new ObjectId(),
                    userId,
                    userName,
                    text,
                    createdAt: new Date()
                };

                const filter = {
                    _id: new ObjectId(postId),
                    "comments._id": new ObjectId(commentId)
                };

                const updateDoc = {
                    $push: { "comments.$.replies": newReply }
                };

                const result = await forumCollection.updateOne(filter, updateDoc);

                if (result.matchedCount === 0) {
                    return res.status(404).json({ message: "Target node trace or comment not found." });
                }

                const updatedPost = await forumCollection.findOne({ _id: new ObjectId(postId) });
                res.status(200).json({ updatedComments: updatedPost.comments || [] });

            } catch (error) {
                res.status(500).json({ message: "Internal nested engine structural collapse.", error: error.message });
            }
        });
        app.patch('/forum-posts/:postId/comment/:commentId/reply/:replyId', async (req, res) => {
            try {
                const { postId, commentId, replyId } = req.params;
                const { userId, text } = req.body;

                const query = { _id: new ObjectId(postId) };

                const filter = { _id: new ObjectId(postId) };
                const updateDoc = {
                    $set: { "comments.$[c].replies.$[r].text": text }
                };
                const options = {
                    arrayFilters: [
                        { "c._id": new ObjectId(commentId) },
                        { "r._id": new ObjectId(replyId), "r.userId": userId }
                    ]
                };

                const result = await forumCollection.updateOne(filter, updateDoc, options);
                if (result.matchedCount === 0) {
                    return res.status(403).json({ message: "Operation blocked or path not traced." });
                }

                const updatedPost = await forumCollection.findOne(query);
                res.status(200).json({ updatedComments: updatedPost.comments || [] });
            } catch (error) {
                res.status(500).json({ message: "Server error on reply update node.", error: error.message });
            }
        });

        app.delete('/forum-posts/:postId/comment/:commentId/reply/:replyId', async (req, res) => {
            try {
                const { postId, commentId, replyId } = req.params;
                const { userId } = req.body;

                const query = { _id: new ObjectId(postId) };

                const filter = {
                    _id: new ObjectId(postId),
                    "comments._id": new ObjectId(commentId)
                };
                const updateDoc = {
                    $pull: { "comments.$.replies": { _id: new ObjectId(replyId), userId: userId } }
                };

                const result = await forumCollection.updateOne(filter, updateDoc);
                if (result.modifiedCount === 0) {
                    return res.status(403).json({ message: "Unauthorized destruction request or reply missing." });
                }

                const updatedPost = await forumCollection.findOne(query);
                res.status(200).json({ updatedComments: updatedPost.comments || [] });
            } catch (error) {
                res.status(500).json({ message: "Server error on reply wiping execution.", error: error.message });
            }
        });


    } finally {
        // await client.close();
    }
}


run().catch(console.dir);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});