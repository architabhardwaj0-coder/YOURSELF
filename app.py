from flask import Flask, render_template, request, redirect, url_for

app = Flask(__name__)

# Route for the First Page (Home Page)
@app.route('/')
def home():
    return render_template('index.html')

# Route for the Sign Up Page
@app.route('/signup', methods=['GET', 'POST'])
def signup():
    if request.method == 'POST':
        # Here you can process the signup data and redirect to dashboard
        return redirect(url_for('dashboard'))
    return render_template('signup.html')

# Route for the Sign In Page
@app.route('/signin', methods=['GET', 'POST'])
def signin():
    if request.method == 'POST':
        # Here you can validate signin details and redirect to dashboard
        return redirect(url_for('dashboard'))
    return render_template('signin.html')

# Route for the Success/Dashboard Page (After clicking Done)
@app.route('/dashboard')
def dashboard():
    return render_template('dashboard.html')

if __name__ == '__main__':
    app.run(debug=True)