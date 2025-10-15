// @ts-check
import { UserDataService } from '../services/data/UserDataService.js';

/**
 * Authentication middleware
 * Validates JWT token and attaches user info to req.user
 */
export function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Extract token from "Bearer <token>" format
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.substring('Bearer '.length)
      : authHeader;

    // Verify token using UserDataService
    const userService = UserDataService.getInstance();
    const decoded = userService.verifyToken(token);
    
    // Attach user to request object
    req.user = {
      id: decoded.id,
      email: decoded.email
    };
    
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
