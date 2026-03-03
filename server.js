
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcrypt');

const app = express();

mongoose.connect('YOUR_MONGODB_CONNECTION_STRING');

const User = mongoose.model('User', new mongoose.Schema({
  name: { type: String, unique: true },
  password: String,
  isAdmin: { type: Boolean, default: false },
  postCountToday: { type: Number, default: 0 },
  totalPosts: { type: Number, default: 0 },
  participatedPosts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
  lastPostDate: { type: Date }
}));

const Post = mongoose.model('Post', new mongoose.Schema({
  title: String,
  description: String,
  options: [String],
  votes: { type: Map, of: Number, default: {} },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.use(session({
  secret: 'secret',
  resave: false,
  saveUninitialized: false
}));

function resetDailyCount(user) {
  const today = new Date().toDateString();
  if (!user.lastPostDate || user.lastPostDate.toDateString() !== today) {
    user.postCountToday = 0;
    user.lastPostDate = new Date();
  }
}

app.post('/register', async (req, res) => {
  const { name, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  try {
    await User.create({ name, password: hash });
    res.redirect('/login.html');
  } catch {
    res.send('이미 존재하는 이름입니다.');
  }
});

app.post('/login', async (req, res) => {
  const { name, password } = req.body;
  const user = await User.findOne({ name });
  if (!user) return res.send('사용자 없음');
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.send('비밀번호 오류');
  req.session.userId = user._id;
  res.redirect('/');
});

app.get('/posts', async (req, res) => {
  const posts = await Post.find();
  res.json(posts);
});

app.post('/posts', async (req, res) => {
  const user = await User.findById(req.session.userId);
  if (!user) return res.sendStatus(401);

  resetDailyCount(user);
  if (user.postCountToday >= 2) return res.send('하루 최대 2회 초과');

  if (user.totalPosts >= 1 && user.participatedPosts.length <= user.totalPosts - 1) {
    return res.send('다른 설문 참여 후 게시 가능');
  }

  const { title, description, options } = req.body;
  await Post.create({
    title,
    description,
    options: options.split(','),
    author: user._id
  });

  user.postCountToday++;
  user.totalPosts++;
  await user.save();

  res.redirect('/');
});

app.post('/vote/:id', async (req, res) => {
  const user = await User.findById(req.session.userId);
  const post = await Post.findById(req.params.id);
  if (!user || !post) return res.sendStatus(404);

  const option = req.body.option;
  post.votes.set(option, (post.votes.get(option) || 0) + 1);
  user.participatedPosts.push(post._id);

  await post.save();
  await user.save();

  res.redirect('/');
});

app.get('/admin', async (req, res) => {
  const user = await User.findById(req.session.userId);
  if (!user || !user.isAdmin) return res.sendStatus(403);
  const users = await User.find();
  const posts = await Post.find();
  res.json({ users, posts });
});

app.listen(3000, () => console.log('Server started on port 3000'));
