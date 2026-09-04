import { Link } from 'react-router-dom';

const NewsCard = ({ item, isAdmin }) => {
  const date = new Date(item.publishedAt).toLocaleDateString();

  return (
    <div className="card flex-col justify-between">
      <div>
        <div className="flex justify-between items-center mb-2">
          <span className="badge">{item.category}</span>
          <span className="text-light text-sm" style={{ fontSize: '0.85rem' }}>{date}</span>
        </div>
        <h3 style={{ fontSize: '1.25rem' }}>{item.title}</h3>
        <p className="text-light mb-4" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {item.content}
        </p>
        <p className="text-sm mb-4"><strong>Source:</strong> {item.source}</p>
      </div>
      <Link 
        to={isAdmin ? `/admin/news/${item._id}` : `/news/${item._id}`} 
        className="btn btn-secondary text-center" 
        style={{ width: '100%' }}
      >
        View Details
      </Link>
    </div>
  );
};

export default NewsCard;
