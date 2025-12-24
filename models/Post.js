
const postsCollection = require("../db").db().collection("posts");
const followsCollection = require("../db").db().collection("follows");
const { ObjectId } = require("mongodb");

const User = require("./User");
const sanitizeHTML = require("sanitize-html");

let Post = function(data, userid, requestedPostId) {
  this.data = data;
  this.errors = [];
  this.userid = userid;
  this.requestedPostId = requestedPostId;
};

Post.prototype.cleanUp = function() {
  if (typeof this.data.title != "string") {
    this.data.title = "";
  }
  if (typeof this.data.body != "string") {
    this.data.body = "";
  }
  this.data = {
    title: sanitizeHTML(this.data.title.trim(), {
      allowedTags: [],
      allowedAttributes: {}
    }),
    body: sanitizeHTML(this.data.body.trim(), {
      allowedTags: [],
      allowedAttributes: {}
    }),
    createdDate: new Date(),
    author: new ObjectId(this.userid)
  };
};

Post.prototype.validate = function() {
  if (this.data.title == "") {
    this.errors.push("You must provide a title.");
  }
  if (this.data.body == "") {
    this.errors.push("You must provide post content.");
  }
};

Post.prototype.create = function() {
  return new Promise((resolve, reject) => {
    this.cleanUp();
    this.validate();
    if (!this.errors.length) {
      postsCollection
        .insertOne(this.data)
        .then(info => {
          resolve(info.insertedId);
        })
        .catch(() => {
          this.errors.push("Please try again later.");
          reject(this.errors);
        });
    } else {
      reject(this.errors);
    }
  });
};

Post.prototype.update = function() {
  return new Promise(async (resolve, reject) => {
    try {
      let post = await Post.findSingleById(this.requestedPostId, this.userid);
      if (post.isVisitorOwner) {
        let status = await this.actuallyUpdate();
        resolve(status);
      } else {
        reject();
      }
    } catch {
      reject();
    }
  });
};

Post.prototype.actuallyUpdate = function() {
  return new Promise(async (resolve, reject) => {
    this.cleanUp();
    this.validate();
    if (!this.errors.length) {
      await postsCollection.findOneAndUpdate(
        { _id: new ObjectId(this.requestedPostId) },
        { $set: { title: this.data.title, body: this.data.body } }
      );
      resolve("success");
    } else {
      resolve("failure");
    }
  });
};

Post.reusablePostQuery = function(uniqueOperations, visitorId) {
  return new Promise(async function(resolve, reject) {
    let aggOperations = uniqueOperations.concat([
      {
        $lookup: {
          from: "users",
          localField: "author",
          foreignField: "_id",
          as: "authorDocument"
        }
      },
      {
        $addFields: {
          authorObject: { $arrayElemAt: ["$authorDocument", 0] }
        }
      },
      {
        $project: {
          title: 1,
          body: 1,
          createdDate: 1,
          authorId: "$author",
          author: {
            username: "$authorObject.username",
            avatar: "$authorObject.email"
          }
        }
      }
    ]);

    let posts = await postsCollection.aggregate(aggOperations).toArray();

    posts = posts.map(function(post) {
      post.isVisitorOwner = visitorId && post.authorId && 
        post.authorId.toString() === visitorId.toString();

      if (post.author && post.author.avatar) {
        post.author.avatar = `https://gravatar.com/avatar/${require('md5')(post.author.avatar)}?s=128`;
      }

      return post;
    });

    resolve(posts);
  });
};

Post.findSingleById = function(id, visitorId) {
  return new Promise(async function(resolve, reject) {
    if (typeof id != "string" || !ObjectId.isValid(id)) {
      reject();
      return;
    }
    let posts = await Post.reusablePostQuery(
      [{ $match: { _id: new ObjectId(id) } }],
      visitorId ? visitorId.toString() : null
    );

    if (posts.length) {
      resolve(posts[0]);
    } else {
      reject();
    }
  });
};

Post.findByAuthorId = function(authorId) {
  return Post.reusablePostQuery([
    { $match: { author: new ObjectId(authorId) } },
    { $sort: { createdDate: -1 } }
  ], null);
};

Post.delete = function(postIdToDelete, currentUserId) {
  return new Promise(async (resolve, reject) => {
    try {
      let post = await Post.findSingleById(postIdToDelete, currentUserId);
      if (post.isVisitorOwner) {
        await postsCollection.deleteOne({ _id: new ObjectId(postIdToDelete) });
        resolve();
      } else {
        reject();
      }
    } catch {
      reject();
    }
  });
};

Post.search = function(searchTerm) {
  return new Promise(async (resolve, reject) => {
    if (typeof searchTerm == "string") {
      let posts = await Post.reusablePostQuery([
        { $match: { $text: { $search: searchTerm } } },
        { $sort: { score: { $meta: "textScore" } } }
      ], null);
      resolve(posts);
    } else {
      reject();
    }
  });
};

Post.countPostsByAuthor = function(id) {
  return new Promise(async (resolve, reject) => {
    let postCount = await postsCollection.countDocuments({ author: new ObjectId(id) });
    resolve(postCount);
  });
};

Post.getFeed = async function(id) {
  let followedUsers = await followsCollection
    .find({ authorId: new ObjectId(id) })
    .toArray();

  followedUsers = followedUsers.map(followDoc => {
    return followDoc.followedId;
  });

  return Post.reusablePostQuery([
    { $match: { author: { $in: followedUsers } } },
    { $sort: { createdDate: -1 } }
  ], id);
};

module.exports = Post;
