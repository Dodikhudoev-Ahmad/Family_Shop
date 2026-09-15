import { Link } from 'react-router-dom';
import { useCategories } from '../../context/CategoriesContext';
import './Footer.css';

export function Footer() {
  const { categories } = useCategories();

  return (
    <footer className="footer">
      <div className="container footer__grid">
        <div className="footer__col">
          <span className="footer__logo">Family Shop</span>
          <p className="footer__text">Одежда для всей семьи — женское, мужское, детское. Минимализм и качество.</p>
        </div>

        <div className="footer__col">
          <h4 className="footer__heading">Категории</h4>
          <ul className="footer__list">
            {categories.map((c) => (
              <li key={c.id}>
                <Link to={`/catalog/${c.slug}`} className="footer__link">
                  {c.name}
                </Link>
              </li>
            ))}
            <li>
              <Link to="/about" className="footer__link">
                О нас
              </Link>
            </li>
          </ul>
        </div>

        <div className="footer__col">
          <h4 className="footer__heading">Контакты</h4>
          <ul className="footer__list">
            <li className="footer__link">+7 (900) 000-00-00</li>
            <li className="footer__link">hello@familyshop.example</li>
            <li className="footer__link">Москва, ул. Примерная, 1</li>
          </ul>
        </div>

        <div className="footer__col">
          <h4 className="footer__heading">Соцсети</h4>
          <ul className="footer__list">
            <li>
              <a className="footer__link" href="#" onClick={(e) => e.preventDefault()}>
                Instagram
              </a>
            </li>
            <li>
              <a className="footer__link" href="#" onClick={(e) => e.preventDefault()}>
                Telegram
              </a>
            </li>
            <li>
              <a className="footer__link" href="#" onClick={(e) => e.preventDefault()}>
                VK
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="footer__bottom container">
        <span>© {new Date().getFullYear()} Family Shop. Все права защищены.</span>
      </div>
    </footer>
  );
}
