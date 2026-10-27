pipeline {
    agent any

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Check Node.js Availability') {
            steps {
                sh 'node --version'
                sh 'npm --version'
            }
        }

        stage('Install Dependencies') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Validate Application') {
            steps {
                sh 'node --check server.js'
                sh 'node --check public/app.js'
                sh 'node --check tests/attendance.test.js'
            }
        }
    }
}
