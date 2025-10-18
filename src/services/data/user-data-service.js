// @ts-check

import jwt from 'jsonwebtoken';
import { db as dbInstance } from '#@models/index.js';
import { JWT_SECRET, JWT_EXPIRES_IN } from '#@/config.js';

export class UserDataService {
  /** @type {UserDataService | null} */
  static instance = null;

  /**
   * @param {Object} [options]
   * @param {*} [options.db]
   */
  static getInstance(options) {
    if (!UserDataService.instance) {
      UserDataService.instance = new UserDataService(options);
    }
    return UserDataService.instance;
  }

  /**
   * @param {Object} [options]
   * @param {*} [options.db]
   */
  constructor(options) {
    const { db } = options || {};
    this.db = db || dbInstance;
  }

  async findAll() {
    return this.db.User.findAll();
  }

  /**
   * Authenticate user and generate JWT token
   * Creates user if doesn't exist, otherwise uses existing user
   * @param {string} email - User's email
   * @returns {Promise<{token: string, user: Object}>}
   */
  async authenticate(email) {
    if (!email) {
      throw new Error('Email is required');
    }

    if (!JWT_SECRET || !JWT_EXPIRES_IN) {
      throw new Error(
        'JWT configuration is missing. Please set JWT_SECRET and JWT_EXPIRES_IN in environment variables.'
      );
    }

    // Find or create user in database
    let user = await this.db.User.findOne({ where: { email } });

    if (!user) {
      // Create new user if doesn't exist
      user = await this.db.User.create({ email });
    }

    // Generate JWT token
    const token = jwt.sign(
      { email: user.email, id: user.id },
      JWT_SECRET,
      /** @type {import('jsonwebtoken').SignOptions} */ ({
        expiresIn: JWT_EXPIRES_IN,
      })
    );

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
      },
    };
  }

  /**
   * Verify JWT token and return decoded payload
   * @param {string} token - JWT token to verify
   * @returns {Object} Decoded token payload
   */
  verifyToken(token) {
    if (!JWT_SECRET) {
      throw new Error('JWT_SECRET is not configured');
    }

    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }
}
