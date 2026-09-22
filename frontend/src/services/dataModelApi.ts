import { apiClient, getApiErrorMessage } from './api';
import { UMLDiagramAST } from '../types/uml';
import { DataModelResult, InheritanceStrategy } from '../types/dataModel';

export interface GenerateDataModelOptions {
  inheritanceStrategy?: InheritanceStrategy;
}

export const dataModelApi = {
  /**
   * Genera el modelo relacional directamente desde el AST local en memoria.
   * Funciona tanto en sesiones activas como en modo offline/demo.
   */
  async generarDesdeAst(ast: UMLDiagramAST, options?: GenerateDataModelOptions): Promise<DataModelResult> {
    try {
      const response = await apiClient.post<{ success: boolean; data: DataModelResult }>(
        '/modelo-datos/generar-directo',
        {
          ast,
          options,
        },
        {
          timeout: 20_000,
        }
      );
      return response.data.data;
    } catch (err) {
      const msg = getApiErrorMessage(err, 'No fue posible generar el modelo de datos relacional.');
      throw new Error(msg);
    }
  },

  /**
   * Genera el modelo relacional a partir de la sesión colaborativa persistida en BD.
   */
  async generarDesdeSesion(sesionId: string, options?: GenerateDataModelOptions): Promise<DataModelResult> {
    try {
      const response = await apiClient.post<{ success: boolean; data: DataModelResult }>(
        `/modelo-datos/sesiones/${sesionId}/generar`,
        {
          options,
        },
        {
          timeout: 20_000,
        }
      );
      return response.data.data;
    } catch (err) {
      const msg = getApiErrorMessage(err, 'No fue posible generar el modelo de datos para la sesión indicada.');
      throw new Error(msg);
    }
  },
};
