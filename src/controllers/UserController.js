// @ts-check
import { UserDataService } from '../services/data/UserDataService.js';

export class UserController {
  constructor(service) {
    this.service = service || UserDataService.getInstance();
  }

  async login(req, res) {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      const result = await this.service.authenticate(email);
      
      res.json({
        token: result.token,
        user: result.user
      });
    } catch (error) {
      res.status(401).json({ 
        error: error.message || 'Authentication failed' 
      });
    }
  }
}
