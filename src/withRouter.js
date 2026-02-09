import React from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';

export default function withRouter(Component) {
  function ComponentWithRouterProp(props) {
    const rawParams = useParams();
    const navigate = useNavigate();
    const location = useLocation();

    // react-router v6 uses '*' for wildcard segments.
    // Map to the named params the app expects (location, filename).
    const params = { ...rawParams };
    if (params['*'] !== undefined) {
      const pathParts = location.pathname.split('/');
      // pathParts: ['', 'files', ...rest] or ['', 'url', ...rest]
      params.location = pathParts[1];
      params.filename = params['*'];
      delete params['*'];
    }

    return <Component {...props} params={params} navigate={navigate} location={location} />;
  }
  ComponentWithRouterProp.displayName = `withRouter(${Component.displayName || Component.name || 'Component'})`;
  return ComponentWithRouterProp;
}
