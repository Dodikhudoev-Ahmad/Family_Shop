import { Link } from 'react-router-dom';
import { CONTACT_ADDRESS, CONTACT_EMAIL, CONTACT_PHONE, SOCIAL_LINKS } from '../../data/contacts';
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

        {(CONTACT_PHONE || CONTACT_EMAIL || CONTACT_ADDRESS) && (
          <div className="footer__col">
            <h4 className="footer__heading">Контакты</h4>
            <ul className="footer__list">
              {CONTACT_PHONE && <li className="footer__link">{CONTACT_PHONE}</li>}
              {CONTACT_EMAIL && <li className="footer__link">{CONTACT_EMAIL}</li>}
              {CONTACT_ADDRESS && <li className="footer__link">{CONTACT_ADDRESS}</li>}
            </ul>
          </div>
        )}

        {SOCIAL_LINKS.length > 0 && (
          <div className="footer__col">
            <h4 className="footer__heading">Соцсети</h4>
            <ul className="footer__list">
              {SOCIAL_LINKS.map((social) => (
                <li key={social.label}>
                  <a className="footer__link" href={social.href} target="_blank" rel="noopener noreferrer">
                    {social.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="footer__bottom container">
        <span>© {new Date().getFullYear()} Family Shop. Все права защищены.</span>
      </div>
    </footer>
  );
}
