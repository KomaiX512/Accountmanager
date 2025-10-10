import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaStar, FaQuoteLeft } from 'react-icons/fa';

interface Review {
  id: number;
  name: string;
  company: string;
  avatar: string;
  rating: number;
  text: string;
  growth: string;
}

const reviews: Review[] = [
  {
    id: 1,
    name: "Sarah Johnson",
    company: "Fashion Boutique",
    avatar: "👩‍💼",
    rating: 5,
    text: "SentientM transformed our social media presence! We went from 500 to 50K followers in just 3 months. The AI understands our brand voice perfectly.",
    growth: "+10,000% growth"
  },
  {
    id: 2,
    name: "Michael Chen",
    company: "Tech Startup",
    avatar: "👨‍💻",
    rating: 5,
    text: "As a startup founder, I don't have time for social media. SentientM handles everything automatically. Our engagement rate increased by 400%!",
    growth: "+400% engagement"
  },
  {
    id: 3,
    name: "Emma Davis",
    company: "Fitness Coach",
    avatar: "💪",
    rating: 5,
    text: "The AI creates better content than I ever could. It knows exactly when to post and what hashtags to use. My client bookings tripled!",
    growth: "3x revenue"
  },
  {
    id: 4,
    name: "David Miller",
    company: "Restaurant Chain",
    avatar: "🍽️",
    rating: 5,
    text: "We manage 15 restaurant locations. SentientM handles all our social accounts seamlessly. Foot traffic increased 60% from social media alone.",
    growth: "+60% foot traffic"
  },
  {
    id: 5,
    name: "Lisa Anderson",
    company: "Beauty Brand",
    avatar: "💄",
    rating: 5,
    text: "The ROI is insane! We're spending 90% less on social media management while getting 5x better results. It's like having a team of experts 24/7.",
    growth: "5x ROI"
  },
  {
    id: 6,
    name: "James Wilson",
    company: "E-commerce Store",
    avatar: "🛒",
    rating: 5,
    text: "Sales from social media increased by 250% in the first month. The AI knows exactly how to convert followers into customers.",
    growth: "+250% sales"
  }
];

const ReviewCarousel: React.FC = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlay, setIsAutoPlay] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (isAutoPlay) {
      intervalRef.current = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % reviews.length);
      }, 4000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isAutoPlay]);

  const handleMouseEnter = () => setIsAutoPlay(false);
  const handleMouseLeave = () => setIsAutoPlay(true);

  const getVisibleReviews = () => {
    const visible = [];
    for (let i = -1; i <= 1; i++) {
      const index = (currentIndex + i + reviews.length) % reviews.length;
      visible.push({ ...reviews[index], position: i });
    }
    return visible;
  };

  return (
    <div className="review-carousel-container">
      <motion.div
        className="review-carousel-header"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        viewport={{ once: true }}
      >
        <h2 className="review-title">
          <span className="gradient-text">50,000+ Businesses</span> Growing With AI
        </h2>
        <p className="review-subtitle">Real results from real businesses using SentientM</p>
      </motion.div>

      <div 
        className="review-carousel"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <AnimatePresence mode="popLayout">
          {getVisibleReviews().map((review) => (
            <motion.div
              key={`${review.id}-${review.position}`}
              className={`review-card ${review.position === 0 ? 'active' : ''}`}
              initial={{ 
                opacity: 0,
                x: review.position * 100,
                scale: review.position === 0 ? 1 : 0.8,
                rotateY: review.position * 15
              }}
              animate={{ 
                opacity: review.position === 0 ? 1 : 0.6,
                x: review.position * 320,
                scale: review.position === 0 ? 1 : 0.85,
                rotateY: review.position * 10,
                z: review.position === 0 ? 50 : 0
              }}
              exit={{ 
                opacity: 0,
                x: review.position * 400,
                scale: 0.7
              }}
              transition={{
                duration: 0.6,
                type: "spring",
                stiffness: 100
              }}
              style={{
                position: 'absolute',
                transformStyle: 'preserve-3d'
              }}
            >
              <div className="review-card-inner">
                <div className="review-header">
                  <div className="review-avatar">{review.avatar}</div>
                  <div className="review-info">
                    <h4>{review.name}</h4>
                    <p>{review.company}</p>
                  </div>
                  <div className="review-rating">
                    {[...Array(5)].map((_, i) => (
                      <FaStar key={i} className="star-icon" />
                    ))}
                  </div>
                </div>
                
                <div className="review-content">
                  <FaQuoteLeft className="quote-icon" />
                  <p>{review.text}</p>
                </div>
                
                <div className="review-growth">
                  <span className="growth-badge">{review.growth}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Navigation dots */}
        <div className="review-dots">
          {reviews.map((_, index) => (
            <button
              key={index}
              className={`dot ${index === currentIndex ? 'active' : ''}`}
              onClick={() => setCurrentIndex(index)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default ReviewCarousel;
