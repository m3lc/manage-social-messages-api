// @ts-check

export function initAssociations(models) {
  models.User.hasMany(models.Mention, { foreignKey: 'userId' });
  models.Mention.belongsTo(models.User, { foreignKey: 'userId' });
  models.Mention.hasMany(models.Mention, { foreignKey: 'mentionId' });
  models.Mention.belongsTo(models.Mention, { foreignKey: 'mentionId' });
}
