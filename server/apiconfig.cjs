module.exports = {
    endpoints: {
      profileInfo: '/profile-info/:userId',
      eventsList: '/events-list/:userId',
      sendDmReply: '/send-dm-reply/:userId',
      sendCommentReply: '/send-comment-reply/:userId',
      ignoreNotification: '/ignore-notification/:userId',
      events: '/events/:userId',
    },
    permissions: {
      insights: ['instagram_basic', 'instagram_manage_insights'],
      comments: ['instagram_basic', 'instagram_manage_comments'],
      dms: ['instagram_basic', 'instagram_manage_messages'],
    },
  };