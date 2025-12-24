

const usersCollection = require("../db").db().collection("users");
const followsCollection = require("../db").db().collection("follows");

// ✅ FIXED: MongoDB v7 correct import
const { ObjectId } = require("mongodb");

const User = require("./User");

let Follow = function(followedUsername, authorId) {
  this.followedUsername = followedUsername;
  this.authorId = authorId;
  this.errors = [];
};

Follow.prototype.cleanUp = function() {
  if (typeof this.followedUsername != "string") {
    this.followedUsername = "";
  }
};

Follow.prototype.validate = async function(action) {
  //followedUsername must exist in database
  let followedAccount = await usersCollection.findOne({
    username: this.followedUsername
  });
  if (followedAccount) {
    this.followedId = followedAccount._id;
  } else {
    this.errors.push("You cannot follow a user that does not exist.");
  }
  let doesFollowAlreadyExist = await followsCollection.findOne({
    followedId: this.followedId,
    authorId: new ObjectId(this.authorId)  // ✅ FIXED
  });

  if (action == "create") {
    if (doesFollowAlreadyExist) {
      this.errors.push("You are already following this user.");
    }
  }
  if (action == "delete") {
    if (!doesFollowAlreadyExist) {
      this.errors.push("You cannot unfollow someone you do not follow.");
    }
  }
  //should not be able to follow yourself
  if (this.followedId.equals(new ObjectId(this.authorId))) {  // ✅ FIXED
    this.errors.push("You cannot follow yourself.");
  }
};

Follow.prototype.create = function() {
  return new Promise(async (resolve, reject) => {
    this.cleanUp();
    await this.validate("create");
    if (!this.errors.length) {
      await followsCollection.insertOne({
        followedId: this.followedId,
        authorId: new ObjectId(this.authorId)  // ✅ FIXED
      });
      resolve();
    } else {
      reject(this.errors);
    }
  });
};

Follow.prototype.delete = function() {
  return new Promise(async (resolve, reject) => {
    this.cleanUp();
    await this.validate("delete");
    if (!this.errors.length) {
      await followsCollection.deleteOne({
        followedId: this.followedId,
        authorId: new ObjectId(this.authorId)  // ✅ FIXED
      });
      resolve();
    } else {
      reject(this.errors);
    }
  });
};

Follow.isVisitorFollowing = async function(followedId, visitorId) {
  let followDoc = await followsCollection.findOne({
    followedId: followedId,
    authorId: new ObjectId(visitorId)  // ✅ FIXED (line 90)
  });
  if (followDoc) {
    return true;
  } else {
    return false;
  }
};

Follow.getFollowersById = function(id) {
  return new Promise(async (resolve, reject) => {
    try {
      let followers = await followsCollection
        .aggregate([
          { $match: { followedId: new ObjectId(id) } },  // ✅ FIXED
          {
            $lookup: {
              from: "users",
              localField: "authorId",
              foreignField: "_id",
              as: "userDoc"
            }
          },
          {
            $project: {
              username: { $arrayElemAt: ["$userDoc.username", 0] },
              email: { $arrayElemAt: ["$userDoc.email", 0] }
            }
          }
        ])
        .toArray();
      followers = followers.map(function(follower) {
        let user = new User(follower, true);
        return { username: follower.username, avatar: user.avatar };
      });
      resolve(followers);
    } catch {
      reject();
    }
  });
};

Follow.getFollowingById = function(id) {
  return new Promise(async (resolve, reject) => {
    try {
      let followers = await followsCollection
        .aggregate([
          { $match: { authorId: new ObjectId(id) } },  // ✅ FIXED
          {
            $lookup: {
              from: "users",
              localField: "followedId",
              foreignField: "_id",
              as: "userDoc"
            }
          },
          {
            $project: {
              username: { $arrayElemAt: ["$userDoc.username", 0] },
              email: { $arrayElemAt: ["$userDoc.email", 0] }
            }
          }
        ])
        .toArray();
      followers = followers.map(function(follower) {
        let user = new User(follower, true);
        return { username: follower.username, avatar: user.avatar };
      });
      resolve(followers);
    } catch {
      reject();
    }
  });
};

Follow.countFollowersById = function(id) {
  return new Promise(async (resolve, reject) => {
    let followerCount = await followsCollection.countDocuments({
      followedId: new ObjectId(id)  // ✅ FIXED
    });
    resolve(followerCount);
  });
};

Follow.countFollowingById = function(id) {
  return new Promise(async (resolve, reject) => {
    let count = await followsCollection.countDocuments({ 
      authorId: new ObjectId(id)  // ✅ FIXED
    });
    resolve(count);
  });
};

module.exports = Follow;
