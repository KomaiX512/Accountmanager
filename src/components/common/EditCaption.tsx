import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  IconButton
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

interface EditCaptionProps {
  caption: string;
  onSave: (caption: string) => void;
  onCancel: () => void;
}

const EditCaption: React.FC<EditCaptionProps> = ({ caption, onSave, onCancel }) => {
  const [text, setText] = useState(caption);
  
  return (
    <Dialog open={true} onClose={onCancel} maxWidth="md" fullWidth>
      <DialogTitle>
        Edit Caption
        <IconButton
          aria-label="close"
          onClick={onCancel}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <TextField
          fullWidth
          multiline
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          variant="outlined"
          sx={{ mt: 2 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave(text)} color="primary">Save</Button>
      </DialogActions>
    </Dialog>
  );
};

export default EditCaption; 