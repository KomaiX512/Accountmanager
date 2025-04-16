import axios from 'axios';

interface FeedbackResponse {
  success: boolean;
  message: string;
}

export const saveFeedback = async (
  username: string,
  responseKey: string,
  feedback: string
): Promise<FeedbackResponse> => {
  try {
    const response = await axios.post(`http://localhost:3000/feedback/${username}`, {
      responseKey,
      feedback,
    });
    return { success: true, message: response.data.message };
  } catch (error) {
    console.error('Error saving feedback:', error);
    return { success: false, message: 'Failed to save feedback.' };
  }
};