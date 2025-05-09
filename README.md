# Instagram Account Manager with RAG Chatbot

This application provides an Instagram account management solution with an integrated Retrieval-Augmented Generation (RAG) chatbot for intelligent Instagram strategy assistance.

## Features

- **Discussion Mode**: Chat with the AI assistant about Instagram strategy, content ideas, and growth tactics
- **Post Mode**: Generate complete Instagram posts including captions, hashtags, and image prompts
- **Dashboard Integration**: Access the chatbot directly from your account dashboard

## Setup Instructions

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```

### Running the Application

1. Start the RAG server:
   ```
   npm run start-server
   ```

2. Start the frontend development server:
   ```
   npm run dev
   ```

3. Access the application at `http://localhost:5173`

## Using the RAG Chatbot

1. Navigate to your dashboard
2. Click the chat icon to open the chatbot modal
3. Choose between "Discussion Mode" and "Post Mode"
4. Enter your query and submit
5. Receive AI-generated responses based on your Instagram profile data

### Discussion Mode

Use this mode to ask questions about your Instagram strategy, such as:
- "How can I improve my engagement rate?"
- "What are the best posting times for my audience?"
- "What content performs best for cosmetics brands?"

### Post Mode

Use this mode to generate complete Instagram posts by providing a brief description:
- "Create a post about summer makeup trends"
- "Generate content for a new product launch"
- "Make a post about our upcoming sale"

## Troubleshooting

If you encounter issues with the RAG server:

1. Ensure the server is running on port 3001
2. Check that the frontend is correctly configured to connect to the server
3. If necessary, restart both the server and frontend applications

## License

[MIT License](LICENSE)