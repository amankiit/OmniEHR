import { Link } from "react-router-dom";

const NotFoundPage = () => {
  return (
    <section className="stack-gap">
      <h1>Not found</h1>
      <p>Requested route does not exist.</p>
      <p>
        <Link to="/" className="inline-link">
          Return to dashboard
        </Link>
      </p>
    </section>
  );
};

export default NotFoundPage;
