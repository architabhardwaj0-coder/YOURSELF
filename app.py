import os
from flask import Flask, jsonify, render_template, request
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy

app = Flask(
    __name__, template_folder="templates", static_folder="static"
)
CORS(app)

app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///yourself.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db = SQLAlchemy(app)


class User(db.Model):
  id = db.Column(db.Integer, primary_key=True)
  username = db.Column(db.String(80), unique=True, nullable=False)
  email = db.Column(db.String(120), unique=True, nullable=False)
  password = db.Column(db.String(120), nullable=False)


class Topic(db.Model):
  id = db.Column(db.Integer, primary_key=True)
  user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
  name = db.Column(db.String(120), nullable=False)


class Question(db.Model):
  id = db.Column(db.Integer, primary_key=True)
  topic_id = db.Column(db.Integer, db.ForeignKey("topic.id"), nullable=False)
  q_type = db.Column(db.String(50), nullable=False)
  question_text = db.Column(db.Text, nullable=False)
  answer_text = db.Column(db.Text, nullable=False)
  options = db.Column(db.Text, nullable=True)


with app.app_context():
  db.create_all()


@app.route("/")
def index():
  return render_template("index.html")


@app.route("/api/signup", methods=["POST"])
def signup():
  data = request.json
  if User.query.filter_by(email=data.get("email")).first():
    return jsonify({"error": "Email already registered"}), 400
  if User.query.filter_by(username=data.get("username")).first():
    return jsonify({"error": "Username taken"}), 400

  new_user = User(
      username=data["username"], email=data["email"], password=data["password"]
  )
  db.session.add(new_user)
  db.session.commit()
  return (
      jsonify(
          {
              "message": "User registered successfully",
              "user_id": new_user.id,
              "username": new_user.username,
          }
      ),
      201,
  )


@app.route("/api/signin", methods=["POST"])
def signin():
  data = request.json
  identifier = data.get("identifier")
  password = data.get("password")

  user = User.query.filter(
      (User.username == identifier) | (User.email == identifier)
  ).first()
  if user and user.password == password:
    return jsonify(
        {"message": "Login successful", "user_id": user.id, "username": user.username}
    )
  return jsonify({"error": "Invalid credentials"}), 401


@app.route("/api/topics", methods=["GET", "POST"])
def handle_topics():
  if request.method == "POST":
    data = request.json
    new_topic = Topic(user_id=data["user_id"], name=data["name"])
    db.session.add(new_topic)
    db.session.commit()
    return jsonify({"id": new_topic.id, "name": new_topic.name}), 201
  else:
    user_id = request.args.get("user_id")
    topics = Topic.query.filter_by(user_id=user_id).all()
    return jsonify([{"id": t.id, "name": t.name} for t in topics])


@app.route("/api/questions", methods=["GET", "POST"])
def handle_questions():
  if request.method == "POST":
    data = request.json
    new_q = Question(
        topic_id=data["topic_id"],
        q_type=data["q_type"],
        question_text=data["question_text"],
        answer_text=data["answer_text"],
        options=data.get("options", ""),
    )
    db.session.add(new_q)
    db.session.commit()
    return jsonify({"message": "Question added successfully"}), 201
  else:
    topic_id = request.args.get("topic_id")
    questions = Question.query.filter_by(topic_id=topic_id).all()
    return jsonify(
        [
            {
                "id": q.id,
                "q_type": q.q_type,
                "question_text": q.question_text,
                "answer_text": q.answer_text,
                "options": q.options,
            }
            for q in questions
        ]
    )


if __name__ == "__main__":
  app.run(debug=True)